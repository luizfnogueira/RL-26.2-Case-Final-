"""Indicadores de acerto das inspeções: cálculo puro, sem banco."""
from app.repositories.inspecao_repository import OrdemConcluida
from app.services.inspecao_service import calcular_indicadores


def concluida(motivo, irregularidade, kwh_recuperado=0.0, kwh_estimado=None):
    return OrdemConcluida(motivo, kwh_estimado, irregularidade, kwh_recuperado)


def test_sem_ordens_concluidas_a_taxa_e_nula():
    assert calcular_indicadores([]) == {
        "concluidas": 0, "com_irregularidade": 0, "taxa_acerto_pct": None,
        "ordens_comparadas": 0, "kwh_mes_campo": 0, "kwh_mes_fila": 0, "por_motivo": [],
    }


def test_taxa_de_acerto_kwh_e_acerto_por_motivo():
    indicadores = calcular_indicadores([
        concluida("Queda de consumo · Religação", True, 100.0, 120.0),
        concluida("Queda de consumo", False, 0.0, 180.0),
        concluida(None, True, 50.0),
    ])
    assert indicadores["concluidas"] == 3
    assert indicadores["com_irregularidade"] == 2
    assert indicadores["taxa_acerto_pct"] == 66.7
    # A estimativa da fila é de 3 meses: (120 + 180) ÷ 3 = 100 kWh/mês, contra 100 kWh/mês informados em campo.
    # A ordem sem estimativa fica fora das duas somas (seus 50 kWh/mês não entram).
    assert indicadores["ordens_comparadas"] == 2
    assert (indicadores["kwh_mes_campo"], indicadores["kwh_mes_fila"]) == (100.0, 100.0)
    # Uma ordem com dois motivos conta nos dois; a ordem sem motivo fica fora do ranking
    assert indicadores["por_motivo"] == [
        {"motivo": "Queda de consumo", "concluidas": 2, "com_irregularidade": 1, "taxa_acerto_pct": 50.0},
        {"motivo": "Religação", "concluidas": 1, "com_irregularidade": 1, "taxa_acerto_pct": 100.0},
    ]


def test_motivo_repetido_na_mesma_ordem_conta_uma_vez():
    [motivo] = calcular_indicadores([concluida("Religação · Religação", True)])["por_motivo"]
    assert (motivo["concluidas"], motivo["com_irregularidade"]) == (1, 1)


def test_sem_estimativa_da_fila_a_ordem_conta_no_acerto_mas_nao_no_kwh():
    indicadores = calcular_indicadores([concluida("Religação", True, 300.0)])
    assert (indicadores["concluidas"], indicadores["taxa_acerto_pct"]) == (1, 100.0)
    assert (indicadores["ordens_comparadas"], indicadores["kwh_mes_campo"], indicadores["kwh_mes_fila"]) == (0, 0, 0)
