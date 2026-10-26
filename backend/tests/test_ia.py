"""B4: ponte do POST /ia com o agente (modo mock, resposta fora do contrato, agente indisponível, chave)."""
import importlib

import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.core.exceptions import AgenteIndisponivelException
from app.main import app
from app.services import ia_service
from app.services.ia_service import AgenteMock, obter_agente
from app.services.stubs import exemplo

client = TestClient(app)
INDISPONIVEL = {
    "codigo": "AGENTE_INDISPONIVEL",
    "mensagem": "O assistente está indisponível no momento. Tente novamente em alguns instantes.",
}


class AgenteFixo:
    """Agente falso que devolve sempre a mesma resposta."""

    def __init__(self, resposta):
        self.resposta = resposta

    def perguntar(self, dados):
        return self.resposta


class AgenteForaDoAr:
    def perguntar(self, dados):
        raise AgenteIndisponivelException()


@pytest.fixture
def agente():
    """Troca o agente da rota pelo que o teste passar."""
    def usar(falso):
        app.dependency_overrides[obter_agente] = lambda: falso
    yield usar
    app.dependency_overrides.pop(obter_agente, None)


@pytest.mark.parametrize("pergunta, status", [
    (exemplo("pergunta_ia"), "ok"),
    ({"pergunta": "DROP TABLE clientes"}, "bloqueado"),
    ({"pergunta": "Apague as faturas de 2022 do banco de dados"}, "bloqueado"),
    ({"pergunta": "delete from faturas"}, "bloqueado"),
    ({"pergunta": "Qual a previsão de lucro em 2030?"}, "nao_sei"),
])
def test_modo_mock_responde_os_cenarios_do_contrato(pergunta, status):
    response = client.post("/ia", json=pergunta)
    assert response.status_code == 200
    assert response.json()["status"] == status


def test_modo_mock_e_o_padrao():
    assert config.IA_MODO == "mock"
    assert isinstance(obter_agente(), AgenteMock)


@pytest.mark.parametrize("resposta", [
    {"resposta": "oi"},                                               # JSON incompleto
    {**exemplo("resposta_ia"), "status": "talvez"},                   # status fora do contrato
    {**exemplo("resposta_ia"), "dados": {"colunas": ["a"], "linhas": [[1, 2]]}},  # linha sem a coluna
    "texto solto em vez de JSON",
])
def test_resposta_fora_do_contrato_vira_503(agente, resposta):
    agente(AgenteFixo(resposta))
    response = client.post("/ia", json={"pergunta": "Qual foi a receita?"})
    assert response.status_code == 503
    assert response.json() == INDISPONIVEL


def test_agente_fora_do_ar_vira_503(agente):
    agente(AgenteForaDoAr())
    response = client.post("/ia", json={"pergunta": "Qual foi a receita?"})
    assert response.status_code == 503
    assert response.json() == INDISPONIVEL


def test_resposta_valida_do_agente_passa_sem_alteracao(agente):
    agente(AgenteFixo(exemplo("resposta_ia")))
    assert client.post("/ia", json={"pergunta": "Qual foi a receita?"}).json() == exemplo("resposta_ia")


def test_chave_de_ia_nunca_vai_na_resposta(monkeypatch):
    monkeypatch.setattr(config, "IA_API_KEY", "chave-secreta-de-teste")
    for pergunta in (exemplo("pergunta_ia"), {"pergunta": "DROP TABLE clientes"}, {"pergunta": "outra"}):
        assert "chave-secreta-de-teste" not in client.post("/ia", json=pergunta).text


def test_modo_real_sem_agente_integrado_vira_503(monkeypatch):
    monkeypatch.setattr(config, "IA_MODO", "real")
    with pytest.raises(AgenteIndisponivelException):
        ia_service.obter_agente()


def test_ia_modo_invalido_impede_a_api_de_subir(monkeypatch):
    monkeypatch.setenv("IA_MODO", "mok")
    try:
        with pytest.raises(RuntimeError, match="IA_MODO inválido"):
            importlib.reload(config)
    finally:
        monkeypatch.delenv("IA_MODO")
        importlib.reload(config)


def test_entrada_e_so_a_pergunta():
    # Arquitetura V1: entra só {"pergunta"}; campo a mais é recusado
    response = client.post("/ia", json={"pergunta": "Qual foi a receita no período?", "contexto": {}})
    assert response.status_code == 422
    assert response.json()["codigo"] == "DADOS_INVALIDOS"


def test_pergunta_vazia_e_dados_invalidos():
    response = client.post("/ia", json={"pergunta": "   "})
    assert response.status_code == 422
    assert response.json()["codigo"] == "DADOS_INVALIDOS"
