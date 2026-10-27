"""Testes do Agente Gerador (CG do CHESS), Regra de Consumo Negativo e Telemetria (GENAI-9, 17)."""

from __future__ import annotations

import json
import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.ai.agent import (
    detectar_pedido_consumo_negativo_explicito,
    responder,
    validar_regra_consumo_negativo_no_sql,
)
from app.ai.contratos import ErroConsulta, PlanoConsulta, RespostaAgente, ResultadoConsulta, SQLBloqueado


def test_deteccao_explicita_de_consumo_negativo() -> None:
    # Perguntas normais (inclusive de menor consumo) NÃO devem liberar consumo negativo
    assert detectar_pedido_consumo_negativo_explicito("Qual foi o menor consumo do mês?") is False
    assert detectar_pedido_consumo_negativo_explicito("Quais UCs tiveram queda de consumo em Olinda?") is False

    # Somente pedidos explícitos de erro de medidor / consumo negativo liberam a flag
    assert (
        detectar_pedido_consumo_negativo_explicito(
            "Quais foram os casos em que o medidor deu erro e deu consumo negativo?"
        )
        is True
    )
    assert detectar_pedido_consumo_negativo_explicito("Liste as UCs com flag_consumo_negativo ativa") is True


def test_validacao_sql_bloqueia_consulta_de_consumo_sem_filtro_negativo() -> None:
    # Sem filtro de flag_consumo_negativo -> levanta ErroConsulta (para acionar ModelRetry)
    sql_inseguro = "SELECT MIN(consumo_kwh) FROM fato_uc_mes WHERE mes_referencia = '2026-06'"
    with pytest.raises(ErroConsulta):
        validar_regra_consumo_negativo_no_sql(sql_inseguro, consumo_negativo_solicitado=False)

    # Com consumo_kwh_valido e flag_consumo_negativo = FALSE -> permitido
    sql_seguro = (
        "SELECT MIN(consumo_kwh_valido) FROM fato_uc_mes "
        "WHERE mes_referencia = '2026-06' AND flag_consumo_negativo = FALSE AND consumo_kwh_valido > 0"
    )
    validar_regra_consumo_negativo_no_sql(sql_seguro, consumo_negativo_solicitado=False)

    # Quando o usuário pede explicitamente casos de consumo negativo -> permitido
    sql_explicito = "SELECT id_uc, consumo_kwh FROM fato_uc_mes WHERE flag_consumo_negativo = TRUE"
    validar_regra_consumo_negativo_no_sql(sql_explicito, consumo_negativo_solicitado=True)


def test_agente_autocorrige_sql_quando_esquece_filtro_de_consumo_negativo() -> None:
    """Garante que se a 1ª tentativa esquecer o filtro de consumo negativo, o ModelRetry corrige na 2ª."""
    sqls_recebidos: list[str] = []

    def executar_sql_mock(sql: str) -> ResultadoConsulta:
        sqls_recebidos.append(sql)
        return ResultadoConsulta(
            colunas=["id_uc", "menor_consumo_kwh"],
            linhas=[["UC-0010", 12.5]],
            n_linhas=1,
            sql_executado=sql,
            tabelas_usadas=["fato_uc_mes"],
        )

    passo = {"n": 0}

    def modelo_autocorrecao(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        passo["n"] += 1
        if passo["n"] == 1:
            # 1ª tentativa: modelo tenta usar MIN(consumo_kwh) sem filtrar consumo negativo
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="consultar_gold",
                        args={"sql": "SELECT id_uc, MIN(consumo_kwh) FROM fato_uc_mes WHERE mes_referencia = '2026-06'"},
                        tool_call_id="call_1",
                    )
                ]
            )
        if passo["n"] == 2:
            # 2ª tentativa (após ModelRetry): modelo corrige usando consumo_kwh_valido e flag_consumo_negativo = FALSE
            sql_corrigido = (
                "SELECT id_uc, MIN(consumo_kwh_valido) AS menor_consumo_kwh "
                "FROM fato_uc_mes WHERE mes_referencia = '2026-06' "
                "AND flag_consumo_negativo = FALSE AND consumo_kwh_valido > 0 GROUP BY id_uc LIMIT 1"
            )
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="consultar_gold",
                        args={"sql": sql_corrigido},
                        tool_call_id="call_2",
                    )
                ]
            )

        saida = RespostaAgente(
            status="ok",
            pergunta_interpretada="Qual foi o menor consumo válido em junho de 2026?",
            plano=PlanoConsulta(
                tabelas=["fato_uc_mes"],
                colunas=["id_uc", "consumo_kwh_valido"],
                filtros=["mes_referencia = '2026-06'", "flag_consumo_negativo = FALSE", "consumo_kwh_valido > 0"],
                agregacao="MIN",
                ordenacao="menor_consumo_kwh ASC",
                limite=1,
                periodo="2026-06",
                inclui_consumo_negativo_explicito=False,
            ),
            sql=sqls_recebidos[-1],
            premissas=["Consumos negativos por falha de medidor foram filtrados (flag_consumo_negativo = FALSE)."],
            marcadores={"v1": 12.5},
            texto="O menor consumo válido registrado em junho de 2026 foi de {v1} kWh na unidade UC-0010.",
            justificativa="Consulta realizada em fato_uc_mes filtrando flag_consumo_negativo = FALSE.",
            confianca="alta",
        )
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    resposta = responder(
        "Qual foi o menor consumo do mês de junho de 2026?",
        modelo=FunctionModel(modelo_autocorrecao),
        executar_sql_fn=executar_sql_mock,
    )

    assert resposta["status"] == "ok"
    assert "12,50" in resposta["resposta"]
    assert len(sqls_recebidos) == 1  # A 1ª query inválida foi barrada antes mesmo de tocar no banco!
    assert "flag_consumo_negativo = FALSE" in resposta["sql"]
    # Telemetria (GENAI-17) registra as 2 tentativas de SQL e a sequência de ferramentas
    detalhes = resposta["detalhes_tecnicos"]
    assert detalhes["consulta"]["tentativas"] == 2
    assert len(detalhes["acoes"]) == 2
    assert detalhes["acoes"][0]["sucesso"] is False
    assert detalhes["acoes"][1]["sucesso"] is True
    assert detalhes["tokens_tempo"]["chamadas"] == 3


def test_sql_bloqueado_encerra_sem_nova_tentativa() -> None:
    chamadas_banco = {"n": 0}

    def executar_sql_bloqueado(sql: str) -> ResultadoConsulta:
        chamadas_banco["n"] += 1
        raise SQLBloqueado("Acesso negado à coluna confidencial cpf_cnpj.")

    passo = {"n": 0}

    def modelo_tentando_cpf(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        passo["n"] += 1
        if passo["n"] == 1:
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="consultar_gold",
                        args={"sql": "SELECT cpf_cnpj FROM dim_uc LIMIT 1"},
                        tool_call_id="call_bloqueada",
                    )
                ]
            )
        saida = RespostaAgente(
            status="bloqueado",
            pergunta_interpretada="Qual o CPF do titular?",
            plano=None,
            sql=None,
            premissas=[],
            marcadores={},
            texto="Solicitação bloqueada.",
            justificativa="Dado pessoal protegido.",
            confianca="alta",
        )
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    resposta = responder(
        "Me passe o CPF do cliente da UC-0001",
        modelo=FunctionModel(modelo_tentando_cpf),
        executar_sql_fn=executar_sql_bloqueado,
    )

    assert resposta["status"] == "bloqueado"
    assert resposta["sql"] is None
    assert chamadas_banco["n"] == 1
