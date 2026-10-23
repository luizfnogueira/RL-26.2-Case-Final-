"""B3a: regras do dashboard_service que não dependem do banco (repository substituído)."""
from decimal import Decimal

import pytest

from app.schemas.dashboard import FiltrosDashboard
from app.services import dashboard_service
from app.services.stubs import PERIODO_ATUAL as PA, PERIODO_COMPARACAO as PC

FILTROS = FiltrosDashboard(periodo_atual=PA, periodo_comparacao=PC)
MESES = [f"{2022 + (6 + i) // 12}-{(6 + i) % 12 + 1:02d}" for i in range(48)]   # 2022-07 … 2026-06


def test_calendario_tem_48_meses_de_jul_2022_a_jun_2026():
    assert len(MESES) == 48 and MESES[0] == "2022-07" and MESES[-1] == "2026-06"


def test_mes_sem_fatura_continua_na_serie_com_null(monkeypatch):
    sem_marco = [(mes, Decimal("100.00")) for mes in MESES if mes != "2024-03"]
    monkeypatch.setattr(dashboard_service.dashboard_repository, "meses_da_base", lambda db: MESES)
    monkeypatch.setattr(dashboard_service.dashboard_repository, "serie_receita", lambda db, i, f, r: sem_marco)
    monkeypatch.setattr(dashboard_service.dashboard_repository, "serie_energia", lambda db, i, f, r: sem_marco[:10])

    serie = dashboard_service.montar_serie(None, FILTROS)

    assert [p["mes"] for p in serie] == MESES
    marco = serie[MESES.index("2024-03")]
    assert marco["receita"]["valor"] is None and marco["receita"]["periodo_referencia"] == "2024-03"
    assert serie[0]["receita"]["valor"] == Decimal("100.00")
    assert sum(p["energia"]["valor"] is None for p in serie) == 38


def test_base_vazia_devolve_serie_vazia(monkeypatch):
    monkeypatch.setattr(dashboard_service.dashboard_repository, "meses_da_base", lambda db: [])
    assert dashboard_service.montar_serie(None, FILTROS) == []


@pytest.mark.parametrize("atual, comparacao", [(None, 10), (10, None), (10, 0), (None, None)])
def test_variacao_ausente_sem_base_de_comparacao(atual, comparacao):
    assert dashboard_service.variacao(atual, comparacao) is None


def test_kpi_com_valor_ausente_nao_inventa_diferenca():
    card = dashboard_service.kpi("DEC médio", None, Decimal("17.4632"), "h/UC", PA, PC)
    assert card["atual"]["valor"] is None
    assert card["diferenca"]["valor"] is None and card["variacao_percentual"]["valor"] is None
    assert card["comparacao"] == {"valor": Decimal("17.4632"), "unidade": "h/UC", "periodo_referencia": PC}


def test_variacao_negativa():
    assert dashboard_service.variacao(Decimal("90"), Decimal("100")) == Decimal("-10.0000")
