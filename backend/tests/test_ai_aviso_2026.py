"""2026 só vai até junho na base: toda resposta sobre o ano de 2026 avisa que o ano está incompleto."""
from __future__ import annotations

import pytest

from app.ai.contratos import RespostaAgente
from app.ai.resposta import AVISO_2026_INCOMPLETO, enriquecer_avisos_e_premissas, menciona_ano_de_2026


def saida(pergunta: str) -> RespostaAgente:
    return RespostaAgente(status="ok", texto="Resposta.", pergunta_interpretada=pergunta)


@pytest.mark.parametrize("pergunta, sql", [
    ("Qual foi a receita de 2026?", None),
    ("Qual foi a receita de 2026 (janeiro a junho)?", None),
    ("Compare a receita de 2025 com 2026", None),
    ("Receita do ano", "SELECT SUM(receita_total) FROM agg_receita_mensal WHERE mes_referencia LIKE '2026%'"),
    ("Receita do ano", "SELECT SUM(receita_total) FROM agg_kpis_mensal WHERE ano = 2026"),
    ("DEC do ano", "SELECT SUM(dec) FROM agg_kpis_mensal WHERE mes_referencia BETWEEN '2026-01' AND '2026-06'"),
    ("Interrupções", "SELECT COUNT(*) FROM uc_interrupcoes WHERE TO_CHAR(data_abertura, 'YYYY') = '2026'"),
    ("Interrupções", "SELECT COUNT(*) FROM uc_interrupcoes WHERE EXTRACT(YEAR FROM data_abertura) = 2026"),
])
def test_ano_de_2026_avisa_que_vai_so_ate_junho(pergunta, sql):
    assert menciona_ano_de_2026(pergunta, sql)
    assert AVISO_2026_INCOMPLETO in enriquecer_avisos_e_premissas(saida(pergunta), sql, None)


@pytest.mark.parametrize("pergunta, sql", [
    # Um mês só ou o P2 (12 meses completos) não precisam do aviso
    ("Qual foi o menor consumo em junho de 2026?", "SELECT MIN(consumo_kwh) FROM fato_uc_mes "
                                                   "WHERE mes_referencia = '2026-06'"),
    ("Receita de jun/2026", "SELECT receita_total FROM agg_kpis_mensal WHERE mes_referencia = '2026-01'"),
    ("Qual foi a receita de P2 (jul/2025 a jun/2026)?",
     "SELECT SUM(receita_total) FROM agg_kpis_mensal WHERE mes_referencia BETWEEN '2025-07' AND '2026-06'"),
    ("Qual foi a receita em 2025 (janeiro a dezembro)?", None),
])
def test_mes_isolado_ou_p2_nao_avisam(pergunta, sql):
    assert not menciona_ano_de_2026(pergunta, sql)
    assert AVISO_2026_INCOMPLETO not in enriquecer_avisos_e_premissas(saida(pergunta), sql, None)


def test_aviso_nao_se_repete():
    resposta = saida("Receita de 2026")
    resposta.premissas = [AVISO_2026_INCOMPLETO]
    assert enriquecer_avisos_e_premissas(resposta, None, None).count(AVISO_2026_INCOMPLETO) == 1
