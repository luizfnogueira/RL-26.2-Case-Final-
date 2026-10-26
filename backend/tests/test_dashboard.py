"""B3a e B3b: GET /dashboard no PostgreSQL (KPIs, série, ponte e drill-down), conferido contra o seed em Python.

Só roda com TEST_DATABASE_URL apontando para um PostgreSQL descartável (recria o schema gold).
"""
import os
from calendar import monthrange
from collections import defaultdict
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import seed
from app.db.session import get_db
from app.main import app
from app.models.gold import AggPrecoVolume, DecFecAlimentadorMes, Fatura, Leitura, UnidadeConsumidora
from app.schemas.dashboard import FiltrosDashboard
from app.services import dashboard_service
from app.services.stubs import PERIODO_ATUAL as PA, PERIODO_COMPARACAO as PC

URL_TESTE = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL_TESTE, reason="defina TEST_DATABASE_URL para testar contra o PostgreSQL")

DADOS = seed.gerar(n_ucs=30, semente=21)
PERIODOS = {"periodo_atual": PA, "periodo_comparacao": PC}
MUNICIPIO = DADOS[UnidadeConsumidora][0]["municipio"]


@pytest.fixture(scope="module")
def engine():
    engine = create_engine(URL_TESTE, pool_pre_ping=True)
    seed.recarregar_gold(engine, DADOS)
    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def client(engine):

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


def get(client, **params) -> dict:
    params = {chave: valor for chave, valor in params.items() if valor is not None}
    response = client.get("/dashboard", params={**PERIODOS, **params})
    assert response.status_code == 200, response.text
    return response.json()


def no_periodo(mes: str, periodo: str) -> bool:
    inicio, fim = periodo.split("/")
    return inicio <= mes <= fim


def ucs(municipio: str | None = None) -> dict[str, dict]:
    return {u["id_uc"]: u for u in DADOS[UnidadeConsumidora] if municipio in (None, u["municipio"])}


def esperado(periodo: str, municipio: str | None = None) -> dict:
    regiao = ucs(municipio)
    faturas = [f for f in DADOS[Fatura] if f["id_uc"] in regiao and no_periodo(f["mes_referencia"], periodo)]
    leituras = [l for l in DADOS[Leitura] if l["id_uc"] in regiao and no_periodo(l["mes_referencia"], periodo)
                and not l["flag_consumo_negativo"]]
    fim = periodo.split("/")[1]
    ano, mes = int(fim[:4]), int(fim[5:])
    ultimo_dia = date(ano, mes, monthrange(ano, mes)[1])
    por_mes = defaultdict(lambda: [0, 0, 0])
    for linha in DADOS[DecFecAlimentadorMes]:
        if no_periodo(linha["mes_referencia"], periodo) and municipio in (None, linha["municipio"]):
            mes = por_mes[linha["mes_referencia"]]
            mes[0] += linha["horas_interrupcao"]
            mes[1] += linha["interrupcoes"]
            mes[2] += linha["ucs_total"]
    return {
        "receita": float(sum(f["valor_total"] for f in faturas)),
        "energia": float(sum(l["consumo_kwh"] for l in leituras)),
        "ucs": sum(1 for u in regiao.values() if u["data_ligacao"] is None or u["data_ligacao"] <= ultimo_dia),
        "aberto": float(sum(f["valor_total"] for f in faturas if f["status"] == "EM ABERTO")),
        "dec": float(sum(h / c for h, _, c in por_mes.values())),
        "fec": float(sum(i / c for _, i, c in por_mes.values())),
    }


@pytest.mark.parametrize("municipio", [None, MUNICIPIO])
def test_indicadores_batem_com_o_seed(client, municipio):
    indicadores = get(client, municipio=municipio)["indicadores"]
    for periodo, lado in ((PA, "atual"), (PC, "comparacao")):
        conta = esperado(periodo, municipio)
        assert indicadores["receita_faturada"][lado]["valor"] == pytest.approx(conta["receita"])
        assert indicadores["energia_faturada"][lado]["valor"] == pytest.approx(conta["energia"])
        assert indicadores["ucs_ativas"][lado]["valor"] == conta["ucs"]
        assert indicadores["inadimplencia"][lado]["valor"] == pytest.approx(conta["aberto"])
        assert indicadores["dec_medio"][lado]["valor"] == pytest.approx(conta["dec"], abs=1e-4)
        assert indicadores["fec_medio"][lado]["valor"] == pytest.approx(conta["fec"], abs=1e-4)
        assert indicadores["receita_faturada"][lado]["periodo_referencia"] == periodo


def test_variacao_e_diferenca(client):
    receita = get(client)["indicadores"]["receita_faturada"]
    atual, comparacao = receita["atual"]["valor"], receita["comparacao"]["valor"]
    assert receita["diferenca"]["valor"] == pytest.approx(atual - comparacao)
    assert receita["variacao_percentual"]["valor"] == pytest.approx((atual - comparacao) / comparacao * 100, abs=1e-4)
    assert "meta" not in get(client)["indicadores"]["dec_medio"]


def test_serie_independe_das_janelas_de_comparacao(engine):
    outra = FiltrosDashboard(periodo_atual="2023-07/2024-06", periodo_comparacao="2022-07/2023-06")
    padrao = FiltrosDashboard(**PERIODOS)
    with Session(bind=engine) as db:
        serie = dashboard_service.montar_serie(db, outra)
        assert serie == dashboard_service.montar_serie(db, padrao)
    assert len(serie) == 48 and serie[0]["mes"] == "2022-07" and serie[-1]["mes"] == "2026-06"


def test_serie_de_48_meses_fecha_com_o_kpi(client):
    dados = get(client)
    serie = dados["serie_historica"]
    assert len(serie) == 48 and serie[0]["mes"] == "2022-07" and serie[-1]["mes"] == "2026-06"
    assert sum(p["receita"]["valor"] for p in serie[-12:]) == pytest.approx(
        dados["indicadores"]["receita_faturada"]["atual"]["valor"])
    assert sum(p["energia"]["valor"] for p in serie[:12]) == pytest.approx(
        dados["indicadores"]["energia_faturada"]["comparacao"]["valor"])


@pytest.mark.parametrize("filtros", [{"municipio": MUNICIPIO, "bairro": "QUALQUER"}, {"classe": "RESIDENCIAL"}])
def test_dec_fec_ausentes_com_recorte_abaixo_do_municipio(client, filtros):
    indicadores = get(client, **filtros)["indicadores"]
    for nome in ("dec_medio", "fec_medio"):
        assert indicadores[nome]["atual"]["valor"] is None
        assert indicadores[nome]["variacao_percentual"]["valor"] is None


def test_municipio_sem_alimentador_tem_dec_fec_ausente(client):
    indicadores = get(client, municipio="INEXISTENTE")["indicadores"]
    assert indicadores["dec_medio"]["atual"]["valor"] is None
    assert indicadores["fec_medio"]["atual"]["valor"] is None


# B3b: ponte de receita e drill-down lidos da agg_preco_volume ----------------------------------

RECORTES = DADOS[AggPrecoVolume]
CAMPOS_RECORTE = ("municipio", "bairro", "classe")
BAIRRO = next(r["bairro"] for r in RECORTES if r["municipio"] == MUNICIPIO)


def recortes(**filtros) -> list[dict]:
    return [r for r in RECORTES if all(filtros.get(c) in (None, r[c]) for c in CAMPOS_RECORTE)]


def valores(ponte: dict) -> dict:
    return {campo: indicador["valor"] for campo, indicador in ponte.items()}


FILTROS_PONTE = [{}, {"municipio": MUNICIPIO}, {"municipio": MUNICIPIO, "bairro": BAIRRO}, {"classe": "RESIDENCIAL"}]


@pytest.mark.parametrize("filtros", FILTROS_PONTE)
def test_soma_das_parcelas_igual_a_variacao_total(client, filtros):
    ponte = valores(get(client, **filtros)["ponte_receita"])
    variacao_total = ponte["receita_energia_atual"] - ponte["receita_energia_comparacao"]
    assert ponte["efeito_preco"] + ponte["efeito_volume"] == pytest.approx(variacao_total, abs=0.005)


@pytest.mark.parametrize("filtros", FILTROS_PONTE)
def test_ponte_le_a_decomposicao_da_gold(client, filtros):
    ponte, linhas = valores(get(client, **filtros)["ponte_receita"]), recortes(**filtros)
    assert ponte["receita_energia_comparacao"] == pytest.approx(float(sum(r["receita_energia_p1"] for r in linhas)))
    assert ponte["receita_energia_atual"] == pytest.approx(float(sum(r["receita_energia_p2"] for r in linhas)))
    assert ponte["efeito_preco"] == pytest.approx(float(sum(r["efeito_preco"] for r in linhas)))
    assert ponte["efeito_volume"] == pytest.approx(float(sum(r["efeito_volume"] for r in linhas)))
    tarifa = lambda receita, kwh: sum(r[receita] for r in linhas) / sum(r[kwh] for r in linhas)
    reajuste = (tarifa("receita_energia_p2", "kwh_p2") / tarifa("receita_energia_p1", "kwh_p1") - 1) * 100
    assert ponte["reajuste_percentual"] == pytest.approx(float(reajuste), abs=1e-4)


def test_receita_de_energia_da_ponte_bate_com_as_faturas(client):
    ponte = valores(get(client)["ponte_receita"])
    for periodo, campo in ((PA, "receita_energia_atual"), (PC, "receita_energia_comparacao")):
        faturas = sum(f["valor_energia"] for f in DADOS[Fatura] if no_periodo(f["mes_referencia"], periodo))
        assert ponte[campo] == pytest.approx(float(faturas))


@pytest.mark.parametrize("filtros", [
    {"nivel": "municipio"},
    {"nivel": "bairro", "municipio": MUNICIPIO},
    {"nivel": "classe", "municipio": MUNICIPIO, "bairro": BAIRRO},
])
def test_drill_fecha_com_a_ponte_e_ordena_pela_maior_queda(client, filtros):
    dados = get(client, **filtros, page_size=100)
    ponte, drill = valores(dados["ponte_receita"]), dados["drill_down"]
    itens = drill["items"]
    nomes = {r[filtros["nivel"]] for r in recortes(**filtros)}
    assert {i["nome"] for i in itens} == nomes and drill["total"] == len(nomes)
    for campo in ("receita_energia_atual", "efeito_preco", "efeito_volume"):
        assert sum(i[campo]["valor"] for i in itens) == pytest.approx(ponte[campo], abs=0.01)
    chaves = [(-i["queda_kwh"]["valor"], i["nome"]) for i in itens]
    assert chaves == sorted(chaves)
    for item in itens:
        assert item["queda_kwh"]["valor"] == pytest.approx(item["energia_comparacao"]["valor"] - item["energia_atual"]["valor"])
        assert item["filtros"][filtros["nivel"]] == item["nome"]


def test_drill_breadcrumb_e_paginacao(client):
    drill = get(client, nivel="classe", municipio=MUNICIPIO, bairro=BAIRRO, page_size=1)["drill_down"]
    assert [b["nivel"] for b in drill["breadcrumb"]] == ["consolidado", "municipio", "bairro"]
    assert drill["breadcrumb"][2]["filtros"] == {"municipio": MUNICIPIO, "bairro": BAIRRO, "classe": None}
    assert len(drill["items"]) == 1 and drill["total"] == len({r["classe"] for r in recortes(municipio=MUNICIPIO, bairro=BAIRRO)})


def test_outro_periodo_tem_kpis_e_ponte_ausente(client):
    outro = {"periodo_atual": "2024-07/2025-06", "periodo_comparacao": "2023-07/2024-06"}
    dados = get(client, **outro)
    assert dados["indicadores"]["receita_faturada"]["atual"]["valor"] == pytest.approx(esperado(outro["periodo_atual"])["receita"])
    assert all(valor is None for valor in valores(dados["ponte_receita"]).values())
    assert dados["drill_down"]["items"] == []
    assert any("2025-07/2026-06" in obs for obs in dados["metadados"]["observacoes"])


@pytest.mark.parametrize("filtros", [
    {"alimentador": DADOS[UnidadeConsumidora][0]["alimentador"]},
    {"municipio": "INEXISTENTE"},
    {"periodo_atual": "2024-07/2025-06", "periodo_comparacao": "2023-07/2024-06"},
])
def test_sem_decomposicao_no_recorte_ponte_ausente(client, filtros):
    dados = get(client, **filtros)
    assert all(valor is None for valor in valores(dados["ponte_receita"]).values())
    assert dados["drill_down"]["items"] == [] and dados["drill_down"]["total"] == 0
    assert set(dados["indicadores"]) == {"receita_faturada", "energia_faturada", "ucs_ativas",
                                         "inadimplencia", "dec_medio", "fec_medio"}
