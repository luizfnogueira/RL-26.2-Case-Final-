"""GET /filtros: opções dos filtros de região, com os nomes exatamente como estão na Gold.

Os testes de banco só rodam com TEST_DATABASE_URL apontando para um PostgreSQL descartável.
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import seed
from app.db.session import get_db
from app.main import app
from app.models.gold import UnidadeConsumidora
from app.schemas.filtros import OpcoesFiltros
from app.services import filtros_service
from app.services.stubs import exemplo

URL_TESTE = os.getenv("TEST_DATABASE_URL")
DADOS = seed.gerar(n_ucs=40, semente=5)
UCS = DADOS[UnidadeConsumidora]


def test_exemplo_do_contrato_segue_o_schema():
    OpcoesFiltros.model_validate(exemplo("filtros"))


def test_service_monta_as_listas_do_repository(monkeypatch):
    repo = filtros_service.filtros_repository
    monkeypatch.setattr(repo, "listar_municipios", lambda db: ["OLINDA", "RECIFE"])
    monkeypatch.setattr(repo, "listar_bairros", lambda db: [("OLINDA", "CENTRO"), ("RECIFE", "CENTRO")])
    monkeypatch.setattr(repo, "listar_classes", lambda db: ["RESIDENCIAL"])
    monkeypatch.setattr(repo, "listar_alimentadores", lambda db: [("ALM-REC-001", "RECIFE")])
    opcoes = filtros_service.montar_filtros(None)
    OpcoesFiltros.model_validate(opcoes)
    # Mesmo nome de bairro em municípios diferentes: duas opções, cada uma com o seu município
    assert opcoes["bairros"] == [
        {"municipio": "OLINDA", "bairro": "CENTRO"},
        {"municipio": "RECIFE", "bairro": "CENTRO"},
    ]
    assert opcoes["alimentadores"] == [{"alimentador": "ALM-REC-001", "municipio": "RECIFE"}]


@pytest.fixture(scope="module")
def client():
    engine = create_engine(URL_TESTE, pool_pre_ping=True)
    seed.recarregar_gold(engine, DADOS)

    def override_get_db():
        db = Session(bind=engine)
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


@pytest.mark.skipif(not URL_TESTE, reason="defina TEST_DATABASE_URL para testar contra o PostgreSQL")
def test_lista_os_valores_do_cadastro_sem_repetir(client):
    response = client.get("/filtros")
    assert response.status_code == 200
    opcoes = response.json()

    assert len(opcoes["municipios"]) == len(set(opcoes["municipios"]))
    assert set(opcoes["municipios"]) == {u["municipio"] for u in UCS}
    assert {(b["municipio"], b["bairro"]) for b in opcoes["bairros"]} == {(u["municipio"], u["bairro"]) for u in UCS}
    assert len(opcoes["bairros"]) == len({(u["municipio"], u["bairro"]) for u in UCS})
    assert set(opcoes["classes"]) == {u["classe"] for u in UCS}
    assert {(a["alimentador"], a["municipio"]) for a in opcoes["alimentadores"]} == {
        (u["alimentador"], u["municipio"]) for u in UCS}


@pytest.mark.skipif(not URL_TESTE, reason="defina TEST_DATABASE_URL para testar contra o PostgreSQL")
def test_valor_listado_funciona_como_filtro_no_dashboard(client):
    # O front manda o valor exatamente como veio de /filtros
    opcoes = client.get("/filtros").json()
    bairro = opcoes["bairros"][0]
    periodos = {"periodo_atual": "2025-07/2026-06", "periodo_comparacao": "2022-07/2023-06"}
    dados = client.get("/dashboard", params={**periodos, **bairro}).json()
    esperadas = sum(1 for u in UCS if (u["municipio"], u["bairro"]) == (bairro["municipio"], bairro["bairro"]))
    assert dados["indicadores"]["ucs_ativas"]["atual"]["valor"] == esperadas
    assert dados["filtros"]["bairro"] == bairro["bairro"]
