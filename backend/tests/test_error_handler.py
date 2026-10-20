from fastapi import APIRouter
from fastapi.testclient import TestClient
import pytest

from app.core.exceptions import (
    AppException,
    JustificativaObrigatoriaException,
    OrdemAtivaExistenteException,
    OrdemNaoEncontradaException,
    ResultadoIncompletoException,
    TransicaoInvalidaException,
    UCInexistenteException,
)
from app.main import app

client = TestClient(app)

error_simulation_router = APIRouter(prefix="/test-errors", tags=["test"])


@error_simulation_router.get("/uc-inexistente")
def route_uc_inexistente():
    raise UCInexistenteException("UC999 não encontrada.")


@error_simulation_router.get("/ordem-ativa")
def route_ordem_ativa():
    raise OrdemAtivaExistenteException("UC já possui ordem ativa.")


@error_simulation_router.get("/ordem-nao-encontrada")
def route_ordem_nao_encontrada():
    raise OrdemNaoEncontradaException("Ordem #123 não encontrada.")


@error_simulation_router.get("/transicao-invalida")
def route_transicao_invalida():
    raise TransicaoInvalidaException("Status não permite a transição solicitada.")


@error_simulation_router.get("/justificativa-obrigatoria")
def route_justificativa():
    raise JustificativaObrigatoriaException("Justificativa é obrigatória.")


@error_simulation_router.get("/resultado-incompleto")
def route_resultado_incompleto():
    raise ResultadoIncompletoException("Resultado de campo incompleto.")


app.include_router(error_simulation_router)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "API funcionando!"}


def test_handler_uc_inexistente_retorna_404_com_codigo_e_mensagem():
    response = client.get("/test-errors/uc-inexistente")
    assert response.status_code == 404
    data = response.json()
    assert data["codigo"] == "UC_INEXISTENTE"
    assert data["mensagem"] == "UC999 não encontrada."


def test_handler_ordem_ativa_retorna_409():
    response = client.get("/test-errors/ordem-ativa")
    assert response.status_code == 409
    data = response.json()
    assert data["codigo"] == "ORDEM_ATIVA_EXISTENTE"
    assert "ativa" in data["mensagem"]


def test_handler_ordem_nao_encontrada_retorna_404():
    response = client.get("/test-errors/ordem-nao-encontrada")
    assert response.status_code == 404
    data = response.json()
    assert data["codigo"] == "ORDEM_NAO_ENCONTRADA"


def test_handler_transicao_invalida_retorna_400():
    response = client.get("/test-errors/transicao-invalida")
    assert response.status_code == 400
    data = response.json()
    assert data["codigo"] == "TRANSICAO_INVALIDA"


def test_handler_justificativa_obrigatoria_retorna_400():
    response = client.get("/test-errors/justificativa-obrigatoria")
    assert response.status_code == 400
    data = response.json()
    assert data["codigo"] == "JUSTIFICATIVA_OBRIGATORIA"


def test_handler_resultado_incompleto_retorna_400():
    response = client.get("/test-errors/resultado-incompleto")
    assert response.status_code == 400
    data = response.json()
    assert data["codigo"] == "RESULTADO_INCOMPLETO"
