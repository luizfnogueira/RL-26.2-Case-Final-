"""DEC/FEC de um período é a soma dos meses (contrato de dados, seção 4), nunca a média.

Caso real da Tela 7: "Qual o DEC médio de P2?" saiu com AVG(dec) = 0,27 h; o DEC de P2 é a soma, 3,30 h.
"""
from __future__ import annotations

import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.ai.agent import responder, validar_regra_dec_fec_no_sql
from app.ai.contratos import ErroConsulta, PlanoConsulta, RespostaAgente, ResultadoConsulta

SQL_MEDIA = "SELECT AVG(dec) AS dec_medio FROM agg_kpis_mensal WHERE periodo = 'P2'"
SQL_SOMA = "SELECT SUM(dec) AS dec_horas_uc FROM agg_kpis_mensal WHERE periodo = 'P2'"


@pytest.mark.parametrize("sql", [
    SQL_MEDIA,
    "SELECT alimentador, avg(a.fec) FROM agg_dec_fec_mensal a GROUP BY 1",
    "SELECT AVG( dec_sem_dia_critico ) FROM agg_kpis_mensal",
])
def test_media_de_dec_ou_fec_no_periodo_e_barrada(sql):
    with pytest.raises(ErroConsulta, match="SOMA dos meses"):
        validar_regra_dec_fec_no_sql(sql, "Qual o DEC médio de P2?")


@pytest.mark.parametrize("sql, pergunta", [
    (SQL_SOMA, "Qual o DEC médio de P2?"),
    (SQL_MEDIA, "Qual a média mensal do DEC em P2?"),
    (SQL_MEDIA, "E por mês?"),
    ("SELECT AVG(nota_satisfacao) FROM uc_atendimentos", "Qual a nota média?"),
    ("SELECT SUM(dec * ucs_atendidas) / SUM(ucs_atendidas) FROM agg_dec_fec_mensal", "DEC de Recife?"),
])
def test_soma_ponderacao_ou_pedido_de_media_mensal_passam(sql, pergunta):
    validar_regra_dec_fec_no_sql(sql, pergunta)


def test_agente_troca_a_media_pela_soma_antes_de_consultar_o_banco() -> None:
    sqls_no_banco: list[str] = []

    def executar_sql(sql: str) -> ResultadoConsulta:
        sqls_no_banco.append(sql)
        return ResultadoConsulta(colunas=["dec_horas_uc"], linhas=[[3.2992]], n_linhas=1,
                                 sql_executado=sql, tabelas_usadas=["agg_kpis_mensal"])

    def modelo(mensagens: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        chamada = sum(isinstance(m, ModelResponse) for m in mensagens)
        if chamada < 2:
            sql = SQL_MEDIA if chamada == 0 else SQL_SOMA
            return ModelResponse(parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": sql},
                                                     tool_call_id=f"c{chamada}")])
        saida = RespostaAgente(
            status="ok", pergunta_interpretada="DEC de P2", sql=SQL_SOMA,
            plano=PlanoConsulta(tabelas=["agg_kpis_mensal"], colunas=["dec"], filtros=["periodo = 'P2'"],
                                agregacao="SUM", limite=1, periodo="P2"),
            marcadores={"v1": 3.2992},
            texto="O DEC de P2 foi de {v1} horas por UC, somando os meses do período.",
            justificativa="Somei o DEC mensal.", confianca="alta")
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    resposta = responder("Qual o DEC médio de P2?", modelo=FunctionModel(modelo), executar_sql_fn=executar_sql)

    assert resposta["status"] == "ok"
    assert sqls_no_banco == [SQL_SOMA]  # a média foi barrada antes de chegar ao banco
    assert "3,30" in resposta["resposta"]
