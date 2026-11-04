"""Leitura honesta do recorte (investigação das médias de satisfação, 03/11/2026).

Casos reais da Tela 7:
- `data_abertura BETWEEN '2022-07-01' AND '2026-06-30'` perdeu 185 atendimentos de 30/06 depois da meia-noite.
- Uma consulta sem filtro de data (toda a base) saiu no texto como "em P2".
"""
import pytest

from app.ai.agent import (REGRAS_CRITICAS_TOPO, corrigir_periodo_do_plano, validar_regra_data_hora_no_sql,
                          validar_rotulo_de_periodo)
from app.ai.contratos import DepsAgente, ErroConsulta, PlanoConsulta, RespostaAgente, ResultadoConsulta
from app.ai.resposta import ViolacaoFidelidadeSaida


@pytest.mark.parametrize("sql", [
    "SELECT canal, AVG(nota_satisfacao) FROM uc_atendimentos "
    "WHERE data_abertura BETWEEN '2022-07-01' AND '2026-06-30' GROUP BY canal",
    "SELECT COUNT(*) FROM uc_interrupcoes WHERE data_abertura >= '2025-07-01' AND data_abertura <= '2026-06-30'",
    "SELECT COUNT(*) FROM uc_atendimentos a WHERE a.data_fechamento between '2025-07-01' and '2025-07-31'",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE data_abertura <= DATE '2026-06-30'",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE data_abertura <= '2026-06-30'::date",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE data_abertura BETWEEN DATE '2025-07-01' AND DATE '2026-06-30'",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE data_abertura <= '2026-06-30 00:00:00'",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE data_abertura::timestamp <= '2026-06-30'",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE '2026-06-30' >= data_abertura",
])
def test_fim_do_intervalo_so_com_a_data_em_coluna_timestamp_e_barrado(sql):
    with pytest.raises(ErroConsulta, match="dia seguinte"):
        validar_regra_data_hora_no_sql(sql)


@pytest.mark.parametrize("sql", [
    "SELECT COUNT(*) FROM uc_atendimentos WHERE TO_CHAR(data_abertura, 'YYYY-MM') BETWEEN '2025-07' AND '2026-06'",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE data_abertura >= '2025-07-01' AND data_abertura < '2026-07-01'",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE data_abertura::date BETWEEN '2025-07-01' AND '2026-06-30'",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE data_abertura BETWEEN '2025-07-01' AND '2026-06-30 23:59:59'",
    "SELECT COUNT(*) FROM dim_uc WHERE data_ligacao BETWEEN '2022-07-01' AND '2026-06-30'",  # coluna date
    "SELECT COUNT(*) FROM uc_atendimentos WHERE data_abertura::date <= DATE '2026-06-30'",
    "SELECT COUNT(*) FROM uc_atendimentos WHERE '2026-07-01' > data_abertura",
])
def test_filtro_de_data_que_cobre_o_dia_inteiro_passa(sql):
    validar_regra_data_hora_no_sql(sql)


def validar_rotulo(texto, *sqls, periodo_do_plano="toda a base"):
    resultados = [ResultadoConsulta(colunas=["canal", "nota_media"], linhas=[["APP", 4.04]], n_linhas=1,
                                    sql_executado=s) for s in sqls]
    deps = DepsAgente(pergunta_original="Qual a média das avaliações entre as plataformas?",
                      historico_resultados=resultados)
    saida = RespostaAgente(
        status="ok", pergunta_interpretada="Média da nota por canal", sql=sqls[-1] if sqls else None,
        plano=PlanoConsulta(tabelas=["uc_atendimentos"], colunas=["nota_satisfacao"], filtros=[],
                            agregacao="AVG", limite=5, periodo=periodo_do_plano),
        marcadores={"v1": 4.04}, texto=texto, justificativa=".", confianca="alta")
    validar_rotulo_de_periodo(deps, saida)


TODA_A_BASE = "SELECT canal, AVG(nota_satisfacao) AS nota_media FROM uc_atendimentos GROUP BY canal"
SO_P2 = ("SELECT canal, AVG(nota_satisfacao) AS nota_media FROM uc_atendimentos "
         "WHERE TO_CHAR(data_abertura, 'YYYY-MM') BETWEEN '2025-07' AND '2026-06' GROUP BY canal")


def test_chamar_de_p2_uma_consulta_da_base_inteira_e_barrado():
    with pytest.raises(ViolacaoFidelidadeSaida, match="nenhuma consulta filtrou 2025-07 a 2026-06"):
        validar_rotulo("Em P2, a nota média do APP foi {v1}.", TODA_A_BASE)


def saida_com_plano(periodo):
    return RespostaAgente(
        status="ok", pergunta_interpretada="Média da nota por canal", sql=TODA_A_BASE,
        plano=PlanoConsulta(tabelas=["uc_atendimentos"], colunas=["nota_satisfacao"], filtros=[],
                            agregacao="AVG", limite=5, periodo=periodo),
        marcadores={"v1": 4.04}, texto="As notas são praticamente iguais: {v1}.", justificativa=".", confianca="alta")


def deps_com(*sqls):
    return DepsAgente(pergunta_original="Qual a média das avaliações entre as plataformas?",
                      historico_resultados=[ResultadoConsulta(colunas=["x"], linhas=[[1]], n_linhas=1,
                                                              sql_executado=s) for s in sqls])


def test_periodo_do_plano_errado_e_corrigido_sem_gastar_outra_chamada():
    """Em tabela, o código escreve "Período considerado: <plano.periodo>"; o modelo pôs P2 sem filtrar (caso real)."""
    corrigida = corrigir_periodo_do_plano(deps_com(TODA_A_BASE), saida_com_plano("P2 (2025-07 a 2026-06)"))
    assert corrigida.plano.periodo == "toda a base (jul/2022 a jun/2026)"
    # Filtrou outros meses: sem rótulo, em vez de um rótulo inventado
    outro = TODA_A_BASE.replace("GROUP BY", "WHERE TO_CHAR(data_abertura, 'YYYY') = '2025' GROUP BY")
    assert corrigir_periodo_do_plano(deps_com(outro), saida_com_plano("P2")).plano.periodo == ""
    # Plano certo fica como está
    assert corrigir_periodo_do_plano(deps_com(SO_P2), saida_com_plano("P2")).plano.periodo == "P2"


@pytest.mark.parametrize("texto, sqls", [
    ("Em P2, a nota média do APP foi {v1}.", [SO_P2]),
    ("Em toda a base, a nota média do APP foi {v1}.", [TODA_A_BASE]),
    # Período pelo 1º dia do mês seguinte
    ("Em P2, {v1}.", ["SELECT AVG(nota_satisfacao) FROM uc_atendimentos "
                      "WHERE data_abertura >= '2025-07-01' AND data_abertura < '2026-07-01'"]),
    # Ponte da receita: as colunas já vêm por período
    ("De P1 para P2, {v1}.", ["SELECT SUM(receita_energia_p1), SUM(receita_energia_p2) FROM agg_preco_volume"]),
    # Uma das consultas da rodada filtrou o período
    ("Em P2, {v1}.", [TODA_A_BASE, SO_P2]),
])
def test_rotulo_que_bate_com_a_consulta_passa(texto, sqls):
    validar_rotulo(texto, *sqls)


def test_prompt_pede_leitura_honesta_das_comparacoes():
    assert "nunca a chame de P1, P2" in REGRAS_CRITICAS_TOPO
    assert "praticamente iguais" in REGRAS_CRITICAS_TOPO
    assert "percentual junto do valor absoluto" in REGRAS_CRITICAS_TOPO
