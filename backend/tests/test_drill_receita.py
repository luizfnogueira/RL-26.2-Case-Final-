"""Drill-down da Tela 2 sem banco: ordenação pelo efeito-volume e recorte sem efeito na Gold."""
from decimal import Decimal
from types import SimpleNamespace

from app.schemas.dashboard import FiltrosDashboard
from app.services.dashboard_service import montar_drill
from app.services.stubs import PERIODO_ATUAL, PERIODO_COMPARACAO


def recorte(classe, efeito_volume):
    return SimpleNamespace(
        municipio="RECIFE", bairro="BOA VISTA", classe=classe,
        receita_energia_p1=Decimal("100"), receita_energia_p2=Decimal("110"),
        kwh_p1=Decimal("50"), kwh_p2=Decimal("45"),
        efeito_preco=Decimal("15"), efeito_volume=efeito_volume,
    )


def test_efeito_volume_nulo_nao_derruba_e_vai_para_o_fim():
    filtros = FiltrosDashboard(periodo_atual=PERIODO_ATUAL, periodo_comparacao=PERIODO_COMPARACAO, nivel="classe")
    drill = montar_drill(
        [recorte("RURAL", None), recorte("COMERCIAL", Decimal("-5")), recorte("RESIDENCIAL", Decimal("-9"))],
        filtros,
    )
    assert [(i["nome"], i["efeito_volume"]["valor"]) for i in drill["items"]] == [
        ("RESIDENCIAL", Decimal("-9")), ("COMERCIAL", Decimal("-5")), ("RURAL", None),
    ]
