"""P1 e P2 são períodos fixos (contrato de dados): P1 = 2022-07 a 2023-06, P2 = 2025-07 a 2026-06.

Caso real da Tela 7: "Compare com P1." saiu com mes_referencia BETWEEN '2024-07' AND '2025-06'.
"""
import pytest

from app.ai.agent import validar_regra_periodo_no_sql
from app.ai.contratos import ErroConsulta

ERRADO = ("SELECT SUM(CASE WHEN mes_referencia BETWEEN '2024-07' AND '2025-06' THEN receita_energia END) AS receita_p1_brl "
          "FROM agg_receita_mensal WHERE municipio = 'OLINDA'")


@pytest.mark.parametrize("sql, pergunta", [
    (ERRADO, "Compare com P1."),
    ("SELECT SUM(receita_energia) FROM agg_receita_mensal WHERE mes_referencia >= '2025-01'", "Receita em P2?"),
    ("SELECT SUM(dec) FROM agg_kpis_mensal WHERE periodo = 'P2'", "DEC de P1 e P2?"),
])
def test_periodo_com_meses_errados_e_barrado(sql, pergunta):
    with pytest.raises(ErroConsulta, match="2022-07|2025-07"):
        validar_regra_periodo_no_sql(sql, pergunta)


@pytest.mark.parametrize("sql, pergunta", [
    ("SELECT SUM(dec) FROM agg_kpis_mensal WHERE periodo = 'P1'", "DEC de P1?"),
    ("SELECT SUM(receita_energia) FROM agg_receita_mensal WHERE mes_referencia BETWEEN '2022-07' AND '2023-06'", "Compare com P1."),
    ("SELECT SUM(kwh_p1), SUM(kwh_p2) FROM agg_preco_volume", "Qual foi a energia faturada em P2 comparada a P1?"),
    ("SELECT SUM(receita_energia) FROM agg_receita_mensal WHERE mes_referencia >= '2026-01'", "Receita deste ano?"),
])
def test_periodo_certo_ou_sem_p1_p2_na_pergunta_passa(sql, pergunta):
    validar_regra_periodo_no_sql(sql, pergunta)
