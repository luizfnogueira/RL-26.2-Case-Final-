"""Pedir esclarecimento: pergunta ambígua volta com opções, sem chamar o modelo (contrato, seção 9)."""
import os
import uuid
from contextlib import nullcontext

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import seed
from app.main import app
from app.repositories import interacao_repository, vocabulario_gold
from app.schemas.ia import RespostaIA
from app.services import ia_service
from app.services.esclarecimento_ia import detectar
from app.services.ia_service import AgenteReal, obter_agente
from app.services.stubs import exemplo

AMBIGUOS = {"CENTRO": {"RECIFE", "OLINDA", "PAULISTA"}, "SAO JOSE": {"RECIFE", "JABOATÃO DOS GUARARAPES"}}


def perguntas(pedido):
    return [o["pergunta"] for o in pedido["opcoes"]]


# ---------- bairro em vários municípios ----------

def test_bairro_em_varios_municipios_pede_o_municipio():
    pedido = detectar("Qual a receita do Centro?", [], AMBIGUOS)
    assert pedido["pergunta"] == "O bairro Centro existe em 3 municípios. De qual você quer saber?"
    assert [o["rotulo"] for o in pedido["opcoes"]] == [
        "Centro de Olinda", "Centro de Paulista", "Centro de Recife", "Todos os municípios juntos"]
    assert perguntas(pedido)[2] == "Qual a receita do Centro (bairro Centro, em Recife)?"


def test_acento_e_caixa_nao_atrapalham_e_o_nome_do_municipio_sai_legivel():
    pedido = detectar("receita em são josé", [], AMBIGUOS)
    assert pedido["opcoes"][0]["rotulo"] == "Sao Jose de Jaboatão dos Guararapes"


@pytest.mark.parametrize("pergunta", [
    "Qual a receita do Centro de Recife?",
    "Receita do centro em OLINDA",
    "Qual a receita do Centro (bairro Centro, somando todos os municípios)?",
    "Qual a receita dos centros comerciais?",
    "Qual a receita de Boa Viagem?",
])
def test_pergunta_clara_nao_pede_esclarecimento(pergunta):
    assert detectar(pergunta, [], AMBIGUOS) is None


def test_municipio_da_troca_anterior_resolve_o_bairro():
    historico = [{"pergunta_interpretada": "Receita comercial de Recife em P2", "resposta_resumo": ""}]
    assert detectar("E no Centro?", historico, AMBIGUOS) is None


@pytest.mark.parametrize("anterior, pergunta", [
    # Casos reais do teste ao vivo: a pergunta anterior citava municípios e o agente somou os 10 Centros
    ("Quais os municípios, fora Recife, com maior receita?", "Receita do Centro em 2026 (janeiro a junho)"),
    ("Compare o consumo de 2025 de Recife e Olinda", "Me de o consumo medio de energia de 2025 do Centro"),
    # Continuação, mas a anterior citou dois municípios: não dá para saber qual
    ("Compare a receita de Recife e Olinda", "E no Centro?"),
])
def test_troca_anterior_nao_resolve_fora_da_continuacao_com_um_municipio(anterior, pergunta):
    historico = [{"pergunta_interpretada": anterior, "resposta_resumo": ""}]
    assert detectar(pergunta, historico, AMBIGUOS, {"RECIFE", "OLINDA", "PAULISTA"}) is not None


def test_os_10_municipios_do_centro_viram_botao_mais_todos():
    # Caso real: na Gold o Centro existe em 10 municípios; com o limite antigo de 8, dois sumiam
    dez = {"CENTRO": {f"MUNICIPIO {i:02d}" for i in range(10)}}
    pedido = detectar("Receita do Centro", [], dez)
    assert len(pedido["opcoes"]) == 11 and pedido["opcoes"][-1]["rotulo"] == "Todos os municípios juntos"
    assert "10 municípios" in pedido["pergunta"]
    doze = {"CENTRO": {f"MUNICIPIO {i:02d}" for i in range(12)}}
    assert len(detectar("Receita do Centro", [], doze)["opcoes"]) == 11


def test_municipio_sem_esse_bairro_tambem_resolve():
    # Caso real: Recife não tem bairro "Centro" na Gold; perguntar de novo não ajuda, o agente responde
    assert detectar("Qual a receita do Centro, em Recife?", [], {"CENTRO": {"OLINDA", "PAULISTA"}},
                    {"RECIFE", "OLINDA", "PAULISTA"}) is None


# ---------- "este ano" ----------

@pytest.mark.parametrize("pergunta, em_2026, em_p2", [
    ("Quais bairros tiveram mais falta de luz este ano?",
     "Quais bairros tiveram mais falta de luz em 2026 (janeiro a junho)?",
     "Quais bairros tiveram mais falta de luz em P2 (jul/2025 a jun/2026)?"),
    ("Qual foi a receita deste ano?", "Qual foi a receita de 2026 (janeiro a junho)?",
     "Qual foi a receita de P2 (jul/2025 a jun/2026)?"),
    ("Consumo no ano atual", "Consumo em 2026 (janeiro a junho)", "Consumo em P2 (jul/2025 a jun/2026)"),
])
def test_este_ano_pede_2026_ou_p2(pergunta, em_2026, em_p2):
    assert perguntas(detectar(pergunta, [], {})) == [em_2026, em_p2]


@pytest.mark.parametrize("pergunta", ["Receita deste ano de 2025", "DEC deste ano em P2",
                                      "Receita do ano passado (2025)", "Volume do último ano em P2",
                                      "Receita dos últimos 12 meses", "Receita nos últimos anos"])
def test_ano_explicito_nao_pede_esclarecimento(pergunta):
    assert detectar(pergunta, [], {}) is None


# ---------- "último ano" e "ano passado" ----------

@pytest.mark.parametrize("pergunta, em_2025, em_12_meses", [
    # Pergunta do case: a base tem 2025 inteiro, mas "último ano" também pode ser os 12 meses mais recentes
    ("Qual bairro mais perdeu volume residencial no último ano?",
     "Qual bairro mais perdeu volume residencial em 2025 (janeiro a dezembro)?",
     "Qual bairro mais perdeu volume residencial nos últimos 12 meses (jul/2025 a jun/2026)?"),
    ("Qual foi a receita do ano passado?", "Qual foi a receita de 2025 (janeiro a dezembro)?",
     "Qual foi a receita dos últimos 12 meses (jul/2025 a jun/2026)?"),
    ("Compare o DEC de Olinda com o ano passado", "Compare o DEC de Olinda com 2025 (janeiro a dezembro)",
     "Compare o DEC de Olinda com os últimos 12 meses (jul/2025 a jun/2026)"),
    ("ultimo ano: receita?", "2025 (janeiro a dezembro): receita?",
     "Os últimos 12 meses (jul/2025 a jun/2026): receita?"),
])
def test_ultimo_ano_pede_2025_ou_os_ultimos_12_meses(pergunta, em_2025, em_12_meses):
    pedido = detectar(pergunta, [], {})
    assert [o["rotulo"] for o in pedido["opcoes"]] == ["2025 (jan a dez)", "Últimos 12 meses (jul/2025 a jun/2026)"]
    assert perguntas(pedido) == [em_2025, em_12_meses]
    assert pedido["pergunta"].startswith("Os dados vão até junho de 2026.")


def test_opcao_escolhida_nao_pede_esclarecimento_de_novo():
    for opcao in perguntas(detectar("Qual foi a receita do ano passado?", [], {})):
        assert detectar(opcao, [], {}) is None


def test_bairro_vem_antes_do_ano():
    assert "bairro Centro" in perguntas(detectar("Receita do Centro este ano", [], AMBIGUOS))[0]


# ---------- vocabulário da Gold ----------

def test_sem_banco_ou_com_erro_no_banco_so_o_caso_do_ano_vale():
    class Quebrado:
        def execute(self, *a):
            raise SQLAlchemyError("fora do ar")
    assert vocabulario_gold.nomes(None, "versao-x")["bairros_ambiguos"] == {}
    assert vocabulario_gold.nomes(Quebrado(), "versao-y")["bairros_ambiguos"] == {}


# ---------- contrato e ponte ----------

def test_contrato_exige_esclarecimento_junto_com_o_status():
    r = exemplo("resposta_ia_esclarecer")
    RespostaIA.model_validate(r)
    with pytest.raises(ValidationError):
        RespostaIA.model_validate({**r, "esclarecimento": None})
    with pytest.raises(ValidationError):
        RespostaIA.model_validate({**exemplo("resposta_ia"), "esclarecimento": r["esclarecimento"]})


def test_ponte_responde_esclarecimento_sem_chamar_o_modelo_e_grava_no_log(monkeypatch):
    gravadas = []
    monkeypatch.setattr(ia_service.interacao_repository, "carregar_historico", lambda db, c: [])
    monkeypatch.setattr(ia_service.interacao_repository, "registrar", lambda db, c, p, r: gravadas.append(r))
    monkeypatch.setattr("app.repositories.gold_metadata.GOLD_SOURCE", "seed")
    monkeypatch.setattr(vocabulario_gold, "nomes",
                        lambda db, versao: {**vocabulario_gold.VAZIO, "bairros_ambiguos": AMBIGUOS})

    def nao_chamar(*a, **k):
        raise AssertionError("não deveria chamar o modelo")
    corpo = AgenteReal(responder=nao_chamar, executar_sql=lambda sql: None, sessao=nullcontext).perguntar(
        ia_service.PerguntaIA(pergunta="Qual a receita do Centro?", conversa_id=uuid.uuid4()))
    RespostaIA.model_validate(corpo)
    assert corpo["status"] == "esclarecer" and len(corpo["esclarecimento"]["opcoes"]) == 4
    assert gravadas[0]["status"] == "esclarecer"


def test_modo_mock_pede_esclarecimento_do_centro():
    app.dependency_overrides[obter_agente] = lambda: ia_service.AgenteMock()
    try:
        corpo = TestClient(app).post("/ia", json={"pergunta": "Qual a receita do Centro?"}).json()
    finally:
        app.dependency_overrides.pop(obter_agente, None)
    assert corpo["status"] == "esclarecer" and corpo["esclarecimento"]["opcoes"][0]["rotulo"] == "Centro de Olinda"


URL_TESTE = os.getenv("TEST_DATABASE_URL")


@pytest.mark.skipif(not URL_TESTE, reason="defina TEST_DATABASE_URL para testar contra o PostgreSQL")
def test_log_aceita_o_status_esclarecer_e_ele_nao_entra_na_memoria():
    engine = create_engine(URL_TESTE)
    seed.preparar_schemas(engine)
    conversa = uuid.uuid4()
    with Session(bind=engine) as db:
        interacao_repository.registrar(db, conversa, "Qual a receita do Centro?", exemplo("resposta_ia_esclarecer"))
        assert interacao_repository.carregar_historico(db, conversa) == []
        status = db.execute(text("SELECT status FROM ia.interacao WHERE conversa_id = :c"), {"c": conversa}).scalar()
    assert status == "esclarecer"
