"""GENAI-2: AgenteReal plugado na ponte do POST /ia, com o agente do Théo rodando dentro do backend.

O modelo é sempre um FunctionModel do PydanticAI: nenhum teste gasta tokens nem precisa de chave.
"""
import json
import os
import sys
import time
import uuid
from contextlib import nullcontext
from functools import partial

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart, UserPromptPart
from pydantic_ai.models.function import FunctionModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.ai.agent import responder as responder_do_theo
from app.ai.contratos import PlanoConsulta, RespostaAgente, ResultadoConsulta
from app.core.exceptions import AgenteIndisponivelException
from app.db import seed
from app.main import app
from app.models.ia import Interacao
from app.schemas.ia import RespostaIA
from app.services import ia_service
from app.services.ia_service import AgenteReal, obter_agente
from app.services.stubs import exemplo

client = TestClient(app)
SQL = ("SELECT municipio, SUM(receita_energia) AS receita_energia_brl FROM agg_receita_mensal "
       "WHERE classe = 'COMERCIAL' GROUP BY municipio ORDER BY 2 DESC LIMIT 2")


@pytest.fixture(autouse=True)
def sem_cache(monkeypatch):
    # O cache do agente é global ao processo: cada teste precisa ver o modelo de verdade.
    monkeypatch.setenv("AI_CACHE_ENABLED", "0")


@pytest.fixture(autouse=True)
def metadados_do_seed(monkeypatch):
    # Os testes simulam o banco com sessao=nullcontext; com GOLD_SOURCE=real no .env, a leitura do _carga_metadata quebraria.
    monkeypatch.setattr("app.repositories.gold_metadata.GOLD_SOURCE", "seed")


@pytest.fixture
def memoria(monkeypatch):
    """Memória em lista, para os testes que não usam o PostgreSQL."""
    gravadas = []
    monkeypatch.setattr(ia_service.interacao_repository, "carregar_historico", lambda db, conversa: [])
    monkeypatch.setattr(ia_service.interacao_repository, "carregar_resumo", lambda db, conversa: [])
    monkeypatch.setattr(ia_service.interacao_repository, "registrar",
                        lambda db, conversa, pergunta, resposta: gravadas.append((conversa, pergunta, resposta)))
    return gravadas


def usar(agente):
    app.dependency_overrides[obter_agente] = lambda: agente


@pytest.fixture(autouse=True)
def limpar_override():
    yield
    app.dependency_overrides.pop(obter_agente, None)


def executar_sql(sql: str) -> ResultadoConsulta:
    return ResultadoConsulta(colunas=["municipio", "receita_energia_brl"],
                             linhas=[["RECIFE", 1200.5], ["OLINDA", 800.25]], n_linhas=2,
                             sql_executado=sql, tabelas_usadas=["agg_receita_mensal"])


def modelo_que_consulta(vistas: list | None = None) -> FunctionModel:
    """1ª chamada: consulta a Gold; 2ª: responde com marcadores. Guarda as mensagens recebidas."""
    def chamar(mensagens, info):
        if vistas is not None:
            vistas.append(mensagens)
        if not any(getattr(p, "part_kind", "") == "tool-return" for m in mensagens[-1:] for p in m.parts):
            return ModelResponse(parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": SQL},
                                                     tool_call_id=f"c{len(mensagens)}")])
        saida = RespostaAgente(
            status="ok",
            pergunta_interpretada="Qual a receita de energia comercial por município?",
            plano=PlanoConsulta(tabelas=["agg_receita_mensal"], colunas=["municipio", "receita_energia"],
                                filtros=["classe = 'COMERCIAL'"], agregacao="SUM", limite=2, periodo="P2"),
            sql=SQL, marcadores={"v1": 1200.5}, texto="Recife lidera, com R$ {v1} de receita de energia.",
            justificativa="Somei a receita de energia por município.", confianca="alta")
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])
    return FunctionModel(chamar)


def agente_do_theo(**extra) -> AgenteReal:
    return AgenteReal(responder=partial(responder_do_theo, modelo=modelo_que_consulta(extra.pop("vistas", None))),
                      executar_sql=executar_sql, sessao=extra.pop("sessao", nullcontext), **extra)


# ---------- ponta a ponta com o agente do Théo ----------

def test_responde_ponta_a_ponta_no_formato_do_contrato(memoria):
    usar(agente_do_theo())
    response = client.post("/ia", json={"pergunta": "Receita comercial por município?"})
    assert response.status_code == 200, response.text
    corpo = response.json()
    RespostaIA.model_validate(corpo)
    assert corpo["status"] == "ok" and "1.200,50" in corpo["resposta"]
    assert corpo["apresentacao"] == "tabela"
    assert corpo["dados"]["linhas"] == [["RECIFE", 1200.5], ["OLINDA", 800.25]]
    detalhes = corpo["detalhes_tecnicos"]
    assert detalhes["consulta"]["sql_executado"] == SQL
    assert [a["ferramenta"] for a in detalhes["acoes"]] == ["consultar_gold"]
    assert detalhes["tokens_tempo"]["chamadas"] == 2


def test_grava_a_troca_com_o_mesmo_conversa_id_da_resposta(memoria):
    usar(agente_do_theo())
    corpo = client.post("/ia", json={"pergunta": "Receita comercial por município?"}).json()
    conversa, pergunta, resposta = memoria[0]
    assert str(conversa) == corpo["conversa_id"]
    assert pergunta == "Receita comercial por município?" and resposta["status"] == "ok"


def test_gold_do_seed_e_marcada_como_ficticia(memoria):
    corpo = agente_do_theo().perguntar(ia_service.PerguntaIA(pergunta="Receita?", conversa_id=uuid.uuid4()))
    assert corpo["metadados"]["dados_ficticios"] is True
    assert corpo["metadados"]["observacoes"][0] == ia_service.OBSERVACAO_SEED


# ---------- falhas viram 503 (GENAI-2.3, 28.3) ----------

INDISPONIVEL = {"codigo": "AGENTE_INDISPONIVEL",
                "mensagem": "O assistente está indisponível no momento. Tente novamente em alguns instantes."}


def falhar(erro):
    def responder(*args, **kwargs):
        raise erro
    return responder


@pytest.mark.parametrize("erro", [
    UsageLimitExceeded("request_limit de 6 atingido"),
    RuntimeError("provedor fora do ar"),
    ValueError("chave de API ausente"),
])
def test_falha_do_agente_vira_503(memoria, erro):
    usar(AgenteReal(responder=falhar(erro), executar_sql=executar_sql, sessao=nullcontext))
    response = client.post("/ia", json={"pergunta": "Receita?"})
    assert (response.status_code, response.json()) == (503, INDISPONIVEL)
    assert memoria == []


def test_estouro_do_prazo_vira_503(memoria):
    def lento(*args, **kwargs):
        time.sleep(1)
        return exemplo("resposta_ia")
    usar(AgenteReal(responder=lento, executar_sql=executar_sql, sessao=nullcontext, prazo_s=0.05))
    assert client.post("/ia", json={"pergunta": "Receita?"}).status_code == 503


def test_prazo_fica_abaixo_do_ia_timeout(monkeypatch):
    monkeypatch.setattr(ia_service.config, "IA_TIMEOUT_S", 30.0)
    assert ia_service.prazo_ia_s() == 25


def test_sem_a_ferramenta_de_consulta_do_vinicius_vira_503(memoria, monkeypatch):
    monkeypatch.setitem(sys.modules, "app.ai.consulta", None)   # import passa a falhar
    with pytest.raises(AgenteIndisponivelException):
        AgenteReal(responder=falhar(AssertionError("não deveria chamar")), sessao=nullcontext).perguntar(
            ia_service.PerguntaIA(pergunta="Receita?", conversa_id=uuid.uuid4()))


def test_resposta_fora_do_contrato_vira_503_e_nao_e_gravada(memoria):
    usar(AgenteReal(responder=lambda *a, **k: {**exemplo("resposta_ia"), "status": "talvez"},
                    executar_sql=executar_sql, sessao=nullcontext))
    assert client.post("/ia", json={"pergunta": "Receita?"}).status_code == 503
    assert memoria == []


def test_ferramenta_que_devolve_dicionario_e_adaptada(monkeypatch):
    class Consulta:
        @staticmethod
        def executar_consulta(sql):
            return {"colunas": ["n"], "linhas": [[1]], "n_linhas": 1, "truncado": False}
    monkeypatch.setitem(sys.modules, "app.ai.consulta", Consulta)
    resultado = ia_service._executor_sql()("SELECT 1")
    assert isinstance(resultado, ResultadoConsulta) and resultado.linhas == [[1]]
    assert resultado.sql_executado == "SELECT 1"


# ---------- memória cheia: o começo da conversa já saiu (GENAI-13) ----------

HISTORICO_CHEIO = [{"pergunta_interpretada": p, "resposta_resumo": "", "sql_executado": None, "filtros": {}}
                   for p in ("Receita comercial de Olinda em P2", "Receita residencial de Olinda em P2", "Olinda P1 x P2")]


RESUMO_CHEIO = [f"Pergunta antiga {i}" for i in range(1, 11)]


@pytest.mark.parametrize("pergunta", ["E o primeiro município que eu perguntei?",
                                      "Qual foi a primeira pergunta?", "O que eu perguntei no início?"])
def test_pergunta_sobre_o_comeco_depois_de_13_trocas_nao_chama_o_modelo(memoria, monkeypatch, pergunta):
    # 3 trocas na memória + 10 no resumo: a 14ª pergunta da conversa já saiu de tudo
    monkeypatch.setattr(ia_service.interacao_repository, "carregar_historico", lambda db, conversa: HISTORICO_CHEIO)
    monkeypatch.setattr(ia_service.interacao_repository, "carregar_resumo", lambda db, conversa: RESUMO_CHEIO)
    monkeypatch.setattr(ia_service.interacao_repository, "contar_trocas", lambda db, conversa: 14)
    agente = AgenteReal(responder=falhar(AssertionError("não deveria chamar o modelo")),
                        executar_sql=executar_sql, sessao=nullcontext)
    corpo = agente.perguntar(ia_service.PerguntaIA(pergunta=pergunta, conversa_id=uuid.uuid4()))
    RespostaIA.model_validate(corpo)
    assert corpo["status"] == "nao_sei"
    assert "últimas 13 perguntas" in corpo["resposta"] and "Pergunta antiga 1" in corpo["resposta"]
    assert memoria[0][2]["status"] == "nao_sei"   # também vai para o log


def test_com_4_trocas_o_modelo_recebe_a_primeira_no_resumo(memoria, monkeypatch):
    # Caso real: depois de Recife, Olinda, residencial e P1, o modelo respondia "Olinda" (Recife tinha saído)
    monkeypatch.setattr(ia_service.interacao_repository, "carregar_historico", lambda db, conversa: HISTORICO_CHEIO)
    monkeypatch.setattr(ia_service.interacao_repository, "carregar_resumo",
                        lambda db, conversa: ["Receita comercial de Recife em P2"])
    monkeypatch.setattr(ia_service.interacao_repository, "contar_trocas", lambda db, conversa: 4)
    recebidos = {}

    def responder(pergunta, **kwargs):
        recebidos.update(kwargs)
        return exemplo("resposta_ia")
    corpo = AgenteReal(responder=responder, executar_sql=executar_sql, sessao=nullcontext).perguntar(
        ia_service.PerguntaIA(pergunta="E o primeiro município que eu perguntei?", conversa_id=uuid.uuid4()))
    assert corpo["status"] == "ok"
    assert recebidos["resumo_conversa"] == ["Receita comercial de Recife em P2"]
    assert "Receita comercial de Recife em P2" not in json.dumps(corpo, default=str)  # o resumo nunca vai ao front


def test_com_a_conversa_inteira_na_memoria_quem_responde_e_o_modelo(memoria, monkeypatch):
    monkeypatch.setattr(ia_service.interacao_repository, "carregar_historico", lambda db, conversa: HISTORICO_CHEIO)
    monkeypatch.setattr(ia_service.interacao_repository, "contar_trocas", lambda db, conversa: 3)
    corpo = AgenteReal(responder=lambda *a, **k: exemplo("resposta_ia"), executar_sql=executar_sql,
                       sessao=nullcontext).perguntar(
        ia_service.PerguntaIA(pergunta="E o primeiro município que eu perguntei?", conversa_id=uuid.uuid4()))
    assert corpo["status"] == "ok"


# ---------- memória no PostgreSQL ----------

URL_TESTE = os.getenv("TEST_DATABASE_URL")


@pytest.mark.skipif(not URL_TESTE, reason="defina TEST_DATABASE_URL para testar a memória contra o PostgreSQL")
def test_segunda_pergunta_recebe_a_primeira_como_historico():
    engine = create_engine(URL_TESTE)
    seed.preparar_schemas(engine)
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE ia.interacao RESTART IDENTITY"))
    vistas: list = []
    usar(agente_do_theo(vistas=vistas, sessao=lambda: Session(bind=engine)))
    try:
        primeira = client.post("/ia", json={"pergunta": "Receita comercial por município?"}).json()
        vistas.clear()
        client.post("/ia", json={"pergunta": "E só em Olinda?", "conversa_id": primeira["conversa_id"]})
        enviados = [p.content for m in vistas[0] for p in m.parts if isinstance(p, UserPromptPart)]
        assert enviados[0] == "Qual a receita de energia comercial por município?"   # troca anterior
        assert enviados[-1] == "E só em Olinda?"
        with Session(bind=engine) as db:
            assert db.query(Interacao).count() == 2
    finally:
        engine.dispose()
