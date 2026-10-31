"""Indicadores de acerto das inspeções: cálculo puro, sem banco."""
from app.repositories.inspecao_repository import OrdemConcluida
from app.services.inspecao_service import calcular_indicadores


def concluida(motivo, irregularidade, kwh_recuperado=0.0, kwh_estimado=None):
    return OrdemConcluida(motivo, kwh_estimado, irregularidade, kwh_recuperado)


def test_sem_ordens_concluidas_a_taxa_e_nula():
    assert calcular_indicadores([]) == {
        "concluidas": 0, "com_irregularidade": 0, "taxa_acerto_pct": None,
        "kwh_recuperado": 0, "kwh_estimado": 0, "por_motivo": [],
    }


def test_taxa_de_acerto_kwh_e_acerto_por_motivo():
    indicadores = calcular_indicadores([
        concluida("Queda de consumo · Religação", True, 100.0, 120.0),
        concluida("Queda de consumo", False, 0.0, 80.0),
        concluida(None, True, 50.0),
    ])
    assert indicadores["concluidas"] == 3
    assert indicadores["com_irregularidade"] == 2
    assert indicadores["taxa_acerto_pct"] == 66.7
    assert (indicadores["kwh_recuperado"], indicadores["kwh_estimado"]) == (150.0, 200.0)
    # Uma ordem com dois motivos conta nos dois; a ordem sem motivo fica fora do ranking
    assert indicadores["por_motivo"] == [
        {"motivo": "Queda de consumo", "concluidas": 2, "com_irregularidade": 1, "taxa_acerto_pct": 50.0},
        {"motivo": "Religação", "concluidas": 1, "com_irregularidade": 1, "taxa_acerto_pct": 100.0},
    ]


def test_motivo_repetido_na_mesma_ordem_conta_uma_vez():
    [motivo] = calcular_indicadores([concluida("Religação · Religação", True)])["por_motivo"]
    assert (motivo["concluidas"], motivo["com_irregularidade"]) == (1, 1)
