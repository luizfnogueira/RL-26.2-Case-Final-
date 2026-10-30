"""Testes de Fidelidade de Saída (GENAI-10), Follow-up com Histórico (GENAI-13) e Apresentação (GENAI-14)."""

from __future__ import annotations

import pytest
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.ai.agent import converter_historico_para_mensagens, responder
from app.ai.contratos import PlanoConsulta, RespostaAgente, ResultadoConsulta, TrocaHistorico
from app.ai.resposta import formatar_numero_pt_br, substituir_marcadores_pt_br


def test_formatacao_marcadores_pt_br() -> None:
    assert formatar_numero_pt_br(181) == "181"
    assert formatar_numero_pt_br(1234567.89) == "1.234.567,89"
    texto = "A receita de energia subiu para R$ {v1} mi ({v2}%) em P2."
    assert (
        substituir_marcadores_pt_br(texto, {"v1": 127.26, "v2": 8.0})
        == "A receita de energia subiu para R$ 127,26 mi (8%) em P2."
    )


def test_output_validator_rejeita_numero_inventado_e_corrige_com_model_retry() -> None:
    """GENAI-10.2: Se o modelo inventar um número que não veio do banco, sofre ModelRetry (1x) e corrige."""
    sql_exec = "SELECT SUM(receita_total) AS receita_brl FROM agg_kpis_mensal WHERE periodo = 'P2'"

    def executar_sql_mock(sql: str) -> ResultadoConsulta:
        return ResultadoConsulta(
            colunas=["receita_brl"],
            linhas=[[169680000.0]],
            n_linhas=1,
            sql_executado=sql,
            tabelas_usadas=["agg_kpis_mensal"],
        )

    passo = {"n": 0}

    def modelo_inventando_depois_corrigindo(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        passo["n"] += 1
        if passo["n"] == 1:
            return ModelResponse(
                parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": sql_exec}, tool_call_id="c1")]
            )
        if passo["n"] == 2:
            # 1ª resposta: inventa 999.99 milhões que não existe no banco!
            invalida = RespostaAgente(
                status="ok",
                pergunta_interpretada="Qual a receita faturada em P2?",
                plano=PlanoConsulta(tabelas=["agg_kpis_mensal"], colunas=["receita_total"], filtros=["periodo = 'P2'"]),
                sql=sql_exec,
                premissas=["Receita total com tributos em P2."],
                marcadores={"v1": 999.99},
                texto="A receita faturada em P2 foi de R$ {v1} milhões.",
                justificativa="Soma de receita_total.",
                confianca="alta",
            )
            return ModelResponse(parts=[TextPart(content=invalida.model_dump_json())])

        # 2ª resposta (após ModelRetry do output_validator): usa o valor real 169,68 milhões
        corrigida = RespostaAgente(
            status="ok",
            pergunta_interpretada="Qual a receita faturada em P2?",
            plano=PlanoConsulta(tabelas=["agg_kpis_mensal"], colunas=["receita_total"], filtros=["periodo = 'P2'"]),
            sql=sql_exec,
            premissas=["Receita total com tributos em P2 (jul/2025 a jun/2026)."],
            marcadores={"v1": 169.68},
            texto="A receita faturada (com tributos) em P2 (2025-07 a 2026-06) foi de R$ {v1} milhões.",
            justificativa="Soma de receita_total em agg_kpis_mensal.",
            confianca="alta",
        )
        return ModelResponse(parts=[TextPart(content=corrigida.model_dump_json())])

    resp = responder(
        "Qual a receita faturada em P2?",
        modelo=FunctionModel(modelo_inventando_depois_corrigindo),
        executar_sql_fn=executar_sql_mock,
    )

    assert resp["status"] == "ok"
    assert "169,68" in resp["resposta"]
    assert "999" not in resp["resposta"]
    assert resp["apresentacao"] == "texto"


def test_output_validator_converte_para_nao_sei_se_insistir_em_numero_inventado() -> None:
    """GENAI-10.2: Se mesmo após 1 ModelRetry o modelo insistir em número fora dos dados, vira status='nao_sei'."""
    sql_exec = "SELECT SUM(receita_total) AS receita_brl FROM agg_kpis_mensal WHERE periodo = 'P2'"

    def executar_sql_mock(sql: str) -> ResultadoConsulta:
        return ResultadoConsulta(
            colunas=["receita_brl"],
            linhas=[[169680000.0]],
            n_linhas=1,
            sql_executado=sql,
            tabelas_usadas=["agg_kpis_mensal"],
        )

    passo = {"n": 0}

    def modelo_teimoso(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        passo["n"] += 1
        if passo["n"] == 1:
            return ModelResponse(
                parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": sql_exec}, tool_call_id="c1")]
            )
        invalida = RespostaAgente(
            status="ok",
            pergunta_interpretada="Qual a receita faturada em P2?",
            plano=PlanoConsulta(tabelas=["agg_kpis_mensal"], colunas=["receita_total"], filtros=["periodo = 'P2'"]),
            sql=sql_exec,
            premissas=[],
            marcadores={"v1": 777.77},
            texto="A receita faturada foi R$ {v1} milhões.",
            justificativa="Chute.",
            confianca="alta",
        )
        return ModelResponse(parts=[TextPart(content=invalida.model_dump_json())])

    resp = responder(
        "Qual a receita faturada em P2?",
        modelo=FunctionModel(modelo_teimoso),
        executar_sql_fn=executar_sql_mock,
    )

    assert resp["status"] == "nao_sei"
    assert resp["sql"] is None
    assert "777" not in resp["resposta"]


def test_correcao_de_premissa_falsa_jaboatao() -> None:
    """GENAI-10.4: 'Quanto a receita comercial cresceu em Jaboatão?' -> exige explicitar que caiu 2,09%."""
    sql_exec = (
        "SELECT municipio, classe, variacao_pct FROM agg_preco_volume "
        "WHERE municipio = 'JABOATÃO DOS GUARARAPES' AND classe = 'COMERCIAL'"
    )

    def executar_sql_mock(sql: str) -> ResultadoConsulta:
        return ResultadoConsulta(
            colunas=["municipio", "classe", "variacao_pct"],
            linhas=[["JABOATÃO DOS GUARARAPES", "COMERCIAL", -2.09]],
            n_linhas=1,
            sql_executado=sql,
            tabelas_usadas=["agg_preco_volume"],
        )

    passo = {"n": 0}

    def modelo_premissa_falsa(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        passo["n"] += 1
        if passo["n"] == 1:
            return ModelResponse(
                parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": sql_exec}, tool_call_id="c1")]
            )
        if passo["n"] == 2:
            # 1ª tentativa: confirma falsamente que "subiu 2,09%"
            enganosa = RespostaAgente(
                status="ok",
                pergunta_interpretada="Quanto a receita comercial cresceu em Jaboatão?",
                plano=PlanoConsulta(tabelas=["agg_preco_volume"], colunas=["variacao_pct"], filtros=[]),
                sql=sql_exec,
                premissas=[],
                marcadores={"v1": 2.09},
                texto="A receita comercial em Jaboatão subiu {v1}% no período.",
                justificativa="",
                confianca="alta",
            )
            return ModelResponse(parts=[TextPart(content=enganosa.model_dump_json())])

        # 2ª tentativa (após ModelRetry do validador de premissa falsa): corrige informando queda de 2,09%
        correta = RespostaAgente(
            status="ok",
            pergunta_interpretada="Quanto a receita comercial variou em Jaboatão entre P1 e P2?",
            plano=PlanoConsulta(tabelas=["agg_preco_volume"], colunas=["variacao_pct"], filtros=[]),
            sql=sql_exec,
            premissas=["Receita de energia sem tributos comparando P2 (jul/25-jun/26) contra P1 (jul/22-jun/23)."],
            marcadores={"v1": -2.09},
            texto=(
                "Ao contrário da premissa da pergunta, a receita comercial de energia em Jaboatão dos Guararapes "
                "não cresceu: ela caiu {v1}% de P1 para P2."
            ),
            justificativa="Correção de premissa falsa com base em agg_preco_volume.",
            confianca="alta",
        )
        return ModelResponse(parts=[TextPart(content=correta.model_dump_json())])

    resp = responder(
        "Quanto a receita comercial cresceu em Jaboatão?",
        modelo=FunctionModel(modelo_premissa_falsa),
        executar_sql_fn=executar_sql_mock,
    )

    assert resp["status"] == "ok"
    assert "caiu" in resp["resposta"].lower()
    assert "-2,09%" in resp["resposta"]


@pytest.mark.parametrize(
    "pergunta_followup,filtro_esperado,pergunta_interpretada_esperada",
    [
        (
            "E só comercial?",
            "classe = 'COMERCIAL'",
            "Qual foi a receita de energia da classe comercial em Recife em P2?",
        ),
        (
            "E em Olinda?",
            "municipio = 'OLINDA'",
            "Qual foi a receita de energia em Olinda em P2?",
        ),
        (
            "E no ano anterior?",
            "periodo = 'P1'",
            "Qual foi o DEC em Recife no período P1 (jul/2022 a jun/2023)?",
        ),
    ],
)
def test_historico_followup_como_mensagens_do_pydantic_ai(
    pergunta_followup: str,
    filtro_esperado: str,
    pergunta_interpretada_esperada: str,
) -> None:
    """GENAI-13: Garante que as últimas 3 trocas entram como message_history e herdam contexto no follow-up."""
    historico = [
        TrocaHistorico(
            pergunta_interpretada="Qual foi a receita de energia em Recife em P2?",
            resposta_resumo="A receita de energia em Recife em P2 foi de R$ 45,20 milhões.",
            sql_executado="SELECT SUM(receita_energia) FROM agg_receita_mensal WHERE municipio = 'RECIFE'",
            filtros={"municipio": "RECIFE", "periodo": "P2"},
        )
    ]

    msgs = converter_historico_para_mensagens(historico)
    assert len(msgs) == 2
    assert isinstance(msgs[0], ModelRequest)
    assert isinstance(msgs[1], ModelResponse)

    mensagens_recebidas_pelo_modelo: list[ModelMessage] = []
    sql_followup = f"SELECT 12500000.0 AS valor FROM agg_receita_mensal WHERE {filtro_esperado}"

    def executar_sql_mock(sql: str) -> ResultadoConsulta:
        return ResultadoConsulta(
            colunas=["valor"],
            linhas=[[12500000.0]],
            n_linhas=1,
            sql_executado=sql,
            tabelas_usadas=["agg_receita_mensal"],
        )

    passo = {"n": 0}

    def modelo_followup(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        passo["n"] += 1
        mensagens_recebidas_pelo_modelo.extend(messages)
        if passo["n"] == 1:
            return ModelResponse(
                parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": sql_followup}, tool_call_id="cf1")]
            )
        saida = RespostaAgente(
            status="ok",
            pergunta_interpretada=pergunta_interpretada_esperada,
            plano=PlanoConsulta(
                tabelas=["agg_receita_mensal"],
                colunas=["valor"],
                filtros=[filtro_esperado],
                periodo="P2",
            ),
            sql=sql_followup,
            premissas=[f"Filtro herdado da conversa anterior com ajuste para {filtro_esperado}."],
            marcadores={"v1": 12.5},
            texto="Considerando o recorte solicitado, o valor foi de {v1} milhões no período.",
            justificativa="Follow-up a partir do histórico.",
            confianca="alta",
        )
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    resp = responder(
        pergunta_followup,
        historico=historico,
        conversa_id="11111111-2222-3333-4444-555555555555",
        modelo=FunctionModel(modelo_followup),
        executar_sql_fn=executar_sql_mock,
    )

    assert resp["status"] == "ok"
    assert resp["conversa_id"] == "11111111-2222-3333-4444-555555555555"
    assert resp["detalhes_tecnicos"]["estrutura_pensamento"]["pergunta_interpretada"] == pergunta_interpretada_esperada
    # O histórico anterior realmente chegou ao modelo na 1ª chamada (sem precisar de chamada extra de reescrita)
    assert len(mensagens_recebidas_pelo_modelo) >= 3


def test_apresentacao_tabela_e_limite_de_50_linhas() -> None:
    """GENAI-14: Rankings/listas retornam apresentacao='tabela', truncam em 50 linhas e informam total real."""
    linhas_simuladas = [[f"BAIRRO-{i:03d}", float(1000 - i)] for i in range(65)]
    sql_ranking = (
        "SELECT bairro, SUM(consumo_kwh) AS consumo_kwh FROM agg_receita_mensal "
        "WHERE mes_referencia BETWEEN '2025-07' AND '2026-06' GROUP BY bairro"
    )

    def executar_sql_ranking(sql: str) -> ResultadoConsulta:
        return ResultadoConsulta(
            colunas=["bairro", "consumo_kwh"],
            linhas=linhas_simuladas,
            n_linhas=65,
            truncado=True,
            sql_executado=sql,
            tabelas_usadas=["agg_receita_mensal"],
        )

    passo = {"n": 0}

    def modelo_ranking(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        passo["n"] += 1
        if passo["n"] == 1:
            return ModelResponse(
                parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": sql_ranking}, tool_call_id="cr1")]
            )
        saida = RespostaAgente(
            status="ok",
            pergunta_interpretada="Qual o consumo por bairro em P2?",
            plano=PlanoConsulta(
                tabelas=["agg_receita_mensal"],
                colunas=["bairro", "consumo_kwh"],
                filtros=["periodo = 'P2'"],
                ordenacao="consumo_kwh DESC",
                periodo="P2 (2025-07 a 2026-06)",
            ),
            sql=sql_ranking,
            premissas=["Consumo válido em kWh por bairro no período P2."],
            marcadores={"v1": "BAIRRO-000", "v2": 1000.0},
            texto="Em P2 (2025-07 a 2026-06), o 1º lugar foi {v1} com {v2} kWh.",
            justificativa="Ranking por bairro.",
            confianca="alta",
        )
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    resp = responder(
        "Mostre o ranking de consumo por bairro em P2",
        modelo=FunctionModel(modelo_ranking),
        executar_sql_fn=executar_sql_ranking,
    )

    assert resp["status"] == "ok"
    assert resp["apresentacao"] == "tabela"
    assert len(resp["dados"]["linhas"]) == 50
    assert "65" in resp["resposta"]
    assert resp["detalhes_tecnicos"]["consulta"]["linhas"] == 65
