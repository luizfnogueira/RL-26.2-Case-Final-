"""Respostas pré-calculadas: pergunta igual ou muito parecida reaproveita a resposta, sem chamar o modelo."""
import os
import uuid
from functools import partial

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db import seed
from app.models.ia import RespostaCache
from app.repositories import vocabulario_gold
from app.services import cache_respostas
from app.services.cache_respostas import SEMELHANCA_MINIMA, assinatura, chave, semelhanca
from app.services.ia_service import AgenteReal, PerguntaIA
from app.services.stubs import exemplo

NOMES = {"municipios": {"RECIFE", "OLINDA", "JABOATÃO DOS GUARARAPES"}, "bairros": {"BOA VIAGEM"},
         "classes": {"COMERCIAL", "RESIDENCIAL"}, "bairros_ambiguos": {}}


def reaproveita(a: str, b: str) -> bool:
    return assinatura(a, NOMES) == assinatura(b, NOMES) and semelhanca(chave(a), chave(b)) >= SEMELHANCA_MINIMA


@pytest.mark.parametrize("a, b", [
    ("Qual foi a receita no período?", "qual foi a receita no periodo"),
    ("Qual foi a receita no período?", "Qual a receita do período?"),
    ("Quanto a receita comercial cresceu em Jaboatão?", "quanto a receita comercial cresceu em jaboatao"),
    ("Quais UCs têm maior risco de perda?", "Me mostre quais UCs tem maior risco de perda"),
    ("Receita comercial de Recife em P2", "Em P2, receita comercial de Recife"),
])
def test_pergunta_igual_ou_muito_parecida_reaproveita(a, b):
    assert reaproveita(a, b)


@pytest.mark.parametrize("a, b", [
    ("Quanto a receita comercial cresceu em Jaboatão?", "Quanto a receita comercial cresceu em Olinda?"),
    ("Receita comercial de Recife em P2", "Receita residencial de Recife em P2"),
    ("Receita comercial de Recife em P2", "Receita comercial de Recife em P1"),
    ("Quais os 5 alimentadores com maior DEC em P2?", "Quais os 10 alimentadores com maior DEC em P2?"),
    ("Qual bairro teve o maior consumo?", "Qual bairro teve o menor consumo?"),
    ("Receita por classe em P2", "Gráfico de pizza da receita por classe em P2"),
    ("Qual foi a receita no período?", "Qual foi o consumo no período?"),
])
def test_nome_numero_periodo_ou_qualificador_diferente_nao_reaproveita(a, b):
    assert not reaproveita(a, b)


# ---------- ponte, contra o PostgreSQL ----------

URL_TESTE = os.getenv("TEST_DATABASE_URL")
precisa_do_banco = pytest.mark.skipif(not URL_TESTE, reason="defina TEST_DATABASE_URL para testar contra o PostgreSQL")


@pytest.fixture
def banco(monkeypatch):
    engine = create_engine(URL_TESTE)
    seed.preparar_schemas(engine)
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE ia.resposta_cache, ia.interacao RESTART IDENTITY"))
    monkeypatch.setattr("app.repositories.gold_metadata.GOLD_SOURCE", "seed")
    monkeypatch.setattr(vocabulario_gold, "nomes", lambda db, versao: NOMES)
    monkeypatch.setenv("AI_CACHE_ENABLED", "1")
    yield engine
    engine.dispose()


def agente(engine, chamadas: list):
    def responder(pergunta, **kwargs):
        chamadas.append(pergunta)
        return exemplo("resposta_ia")
    return AgenteReal(responder=responder, executar_sql=lambda sql: None, sessao=partial(Session, bind=engine))


@precisa_do_banco
def test_segunda_pergunta_parecida_sai_do_cache_sem_chamar_o_modelo(banco):
    chamadas: list = []
    primeira = agente(banco, chamadas).perguntar(PerguntaIA(pergunta="Qual foi a receita no período?"))
    segunda = agente(banco, chamadas).perguntar(PerguntaIA(pergunta="qual a receita do periodo"))
    assert chamadas == ["Qual foi a receita no período?"]
    assert segunda["dados"] == primeira["dados"] and segunda["resposta"] == primeira["resposta"]
    tokens = segunda["detalhes_tecnicos"]["tokens_tempo"]
    assert tokens["cache"] is True and tokens["tokens_entrada"] == 0 and tokens["chamadas"] == 0
    assert any("Qual foi a receita no período?" in o for o in segunda["metadados"]["observacoes"])
    with Session(bind=banco) as db:
        assert db.query(RespostaCache).one().acertos == 1


@precisa_do_banco
def test_pergunta_com_historico_ou_nao_ok_nao_usa_o_cache(banco, monkeypatch):
    chamadas: list = []
    conversa = uuid.uuid4()
    agente(banco, chamadas).perguntar(PerguntaIA(pergunta="Qual foi a receita no período?", conversa_id=conversa))
    # Mesma pergunta numa conversa que já tem uma troca: depende do contexto, vai ao modelo
    agente(banco, chamadas).perguntar(PerguntaIA(pergunta="Qual foi a receita no período?", conversa_id=conversa))
    assert len(chamadas) == 2
    nao_sei = AgenteReal(responder=lambda *a, **k: exemplo("resposta_ia_nao_sei"), executar_sql=lambda s: None,
                         sessao=partial(Session, bind=banco))
    nao_sei.perguntar(PerguntaIA(pergunta="Qual a previsão de lucro em 2030?"))
    with Session(bind=banco) as db:
        assert [c.pergunta for c in db.query(RespostaCache).all()] == ["Qual foi a receita no período?"]


@precisa_do_banco
def test_outra_versao_da_gold_esvazia_o_cache(banco):
    with Session(bind=banco) as db:
        cache_respostas.guardar(db, "Qual foi a receita no período?", "v1", NOMES, exemplo("resposta_ia"))
        assert cache_respostas.buscar(db, "Qual foi a receita no período?", "v2", NOMES) is None
        cache_respostas.guardar(db, "Qual a receita de Recife?", "v2", NOMES, exemplo("resposta_ia"))
        assert [c.versao_gold for c in db.query(RespostaCache).all()] == ["v2"]


@precisa_do_banco
def test_cache_desligado_sempre_chama_o_modelo(banco, monkeypatch):
    monkeypatch.setenv("AI_CACHE_ENABLED", "0")
    chamadas: list = []
    for _ in range(2):
        agente(banco, chamadas).perguntar(PerguntaIA(pergunta="Qual foi a receita no período?"))
    assert len(chamadas) == 2


def test_sem_banco_o_cache_fica_de_fora_sem_erro():
    assert cache_respostas.buscar(None, "Qual foi a receita?", "v1", NOMES) is None
    cache_respostas.guardar(None, "Qual foi a receita?", "v1", NOMES, exemplo("resposta_ia"))
