"""Contar ou somar interrupções em uc_interrupcoes segue a regra do DEC (skill de continuidade, regra 5).

Oscilação de menos de 3 min, ocorrência sem interrupção e ocorrência antes da ligação não são interrupção.
"""
from __future__ import annotations

import pytest

from app.ai.agent import validar_regra_interrupcoes_no_sql
from app.ai.contratos import ErroConsulta

FILTROS = "flag_sem_interrupcao = FALSE AND flag_antes_ligacao = FALSE AND duracao_efetiva_min >= 3"


@pytest.mark.parametrize("sql, falta", [
    ("SELECT causa, COUNT(*) FROM uc_interrupcoes WHERE TO_CHAR(data_abertura, 'YYYY') = '2025' GROUP BY causa",
     "flag_sem_interrupcao = FALSE AND flag_antes_ligacao = FALSE AND duracao_efetiva_min >= 3"),
    ("SELECT COUNT(*) FROM uc_interrupcoes WHERE flag_sem_interrupcao = FALSE AND flag_antes_ligacao = FALSE",
     "duracao_efetiva_min >= 3"),
    ("SELECT alimentador, SUM(duracao_efetiva_min) FROM uc_interrupcoes i "
     "WHERE NOT i.flag_sem_interrupcao AND duracao_efetiva_min >= 3 GROUP BY 1",
     "flag_antes_ligacao = FALSE"),
])
def test_contagem_sem_os_filtros_de_oscilacao_e_barrada(sql, falta):
    with pytest.raises(ErroConsulta, match="oscilação não é interrupção") as erro:
        validar_regra_interrupcoes_no_sql(sql, "Quais as causas de interrupção em 2025?")
    assert falta in str(erro.value)


def test_duracao_bruta_e_barrada_mesmo_com_os_filtros():
    sql = f"SELECT SUM(duracao_min) / 60.0 AS horas FROM uc_interrupcoes WHERE {FILTROS}"
    with pytest.raises(ErroConsulta, match="duracao_efetiva_min"):
        validar_regra_interrupcoes_no_sql(sql, "Quantas horas de falta de luz em P2?")


@pytest.mark.parametrize("sql", [
    # Exemplo 3 da skill de continuidade e gabarito G19 do golden set
    f"SELECT causa, COUNT(*), ROUND(SUM(duracao_efetiva_min) / 60.0, 1) FROM uc_interrupcoes "
    f"WHERE TO_CHAR(data_abertura, 'YYYY') = '2025' AND {FILTROS} GROUP BY causa",
    "SELECT u.bairro, COUNT(*) FROM uc_interrupcoes i JOIN dim_uc u ON u.id_uc = i.id_uc "
    "WHERE i.flag_sem_interrupcao = FALSE AND i.flag_antes_ligacao IS FALSE AND i.duracao_efetiva_min >= 3 "
    "GROUP BY u.bairro",
    "SELECT COUNT(*) FROM uc_interrupcoes WHERE NOT flag_sem_interrupcao AND NOT flag_antes_ligacao "
    "AND duracao_efetiva_min >= 3.0",
    # Listar as ocorrências de uma UC não é contar
    "SELECT id_ocorrencia, causa, duracao_efetiva_min FROM uc_interrupcoes WHERE id_uc = 'UC-1' LIMIT 10",
    # Outras tabelas não entram na regra
    "SELECT SUM(dec) FROM agg_kpis_mensal WHERE periodo = 'P2'",
])
def test_contagem_com_os_filtros_ou_sem_agregar_passa(sql):
    validar_regra_interrupcoes_no_sql(sql, "Quais as causas de interrupção em 2025?")


@pytest.mark.parametrize("pergunta", [
    "Quantas oscilações houve em Olinda?",
    "Quantas piscadas de luz tivemos em P2?",
    "Quantas ocorrências sem interrupção foram registradas?",
    "Conte todas as ocorrências de 2025",
])
def test_pergunta_sobre_oscilacao_dispensa_os_filtros(pergunta):
    validar_regra_interrupcoes_no_sql("SELECT COUNT(*) FROM uc_interrupcoes WHERE duracao_efetiva_min < 3", pergunta)


@pytest.mark.parametrize("corte, barra", [(">= 30", False), ("> 3", False), (">= 1", True), ("> 2.5", True)])
def test_corte_de_duracao_precisa_deixar_a_oscilacao_de_fora(corte, barra):
    sql = f"SELECT COUNT(*) FROM uc_interrupcoes WHERE flag_sem_interrupcao = FALSE AND " \
          f"flag_antes_ligacao = FALSE AND duracao_efetiva_min {corte}"
    if barra:
        with pytest.raises(ErroConsulta, match="duracao_efetiva_min >= 3"):
            validar_regra_interrupcoes_no_sql(sql, "Quantas interrupções longas houve?")
    else:
        validar_regra_interrupcoes_no_sql(sql, "Quantas interrupções longas houve?")
