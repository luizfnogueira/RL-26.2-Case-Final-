"""Ponte e drill-down da Tela 2 sem banco: efeito nulo na Gold vale 0 e os dois continuam fechando."""
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.schemas.dashboard import FiltrosDashboard
from app.services.dashboard_service import montar_drill, montar_ponte
from app.services.stubs import PERIODO_ATUAL, PERIODO_COMPARACAO


def recorte(classe, efeito_volume, efeito_preco=Decimal("15")):
    return SimpleNamespace(
        municipio="RECIFE", bairro="BOA VISTA", classe=classe,
        receita_energia_p1=Decimal("100"), receita_energia_p2=Decimal("110"),
        kwh_p1=Decimal("50"), kwh_p2=Decimal("45"),
        efeito_preco=efeito_preco, efeito_volume=efeito_volume,
    )


# Nulo só aparece com kWh zero nos dois períodos (fórmula da gold_receita): o efeito verdadeiro é 0
LINHAS = [
    recorte("RURAL", None, None),
    recorte("COMERCIAL", Decimal("-5")),
    recorte("RESIDENCIAL", Decimal("-9")),
]
FILTROS = FiltrosDashboard(periodo_atual=PERIODO_ATUAL, periodo_comparacao=PERIODO_COMPARACAO, nivel="classe")


def test_efeito_nulo_vale_zero_no_drill_e_na_ordenacao():
    itens = montar_drill(LINHAS, FILTROS)["items"]
    assert [(i["nome"], i["efeito_volume"]["valor"], i["efeito_preco"]["valor"]) for i in itens] == [
        ("RESIDENCIAL", Decimal("-9"), Decimal("15")),
        ("COMERCIAL", Decimal("-5"), Decimal("15")),
        ("RURAL", 0, 0),
    ]


@pytest.mark.parametrize("campo", ["efeito_volume", "efeito_preco"])
def test_ponte_nao_da_500_e_fecha_com_o_drill(campo):
    ponte = montar_ponte(LINHAS, FILTROS)
    drill = montar_drill(LINHAS, FILTROS)["items"]
    assert ponte[campo]["valor"] == sum(i[campo]["valor"] for i in drill)
