"""Testes de Seleção de Schema por Skills (GENAI-23), Cache (GENAI-24) e CHASE-SQL Seletivo (GENAI-31)."""

from __future__ import annotations

import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.ai.agent import responder
from app.ai.cache import limpar_cache_respostas
from app.ai.contratos import PlanoConsulta, RespostaAgente, ResultadoConsulta, TrocaHistorico
from app.ai.roteador import gerar_catalogo_resumido, montar_contexto_schema, selecionar_skills


def test_roteador_ss_seleciona_ate_duas_skills_pelo_glossario() -> None:
    """GENAI-23.1: Escolhe 1 ou 2 skills sem chamar o modelo."""
    assert selecionar_skills("Qual foi a receita faturada e a conta de luz em Recife?") == ["receita"]
    assert selecionar_skills("Qual o DEC e o FEC por alimentador após falta de luz?") == ["continuidade"]
    assert selecionar_skills("Quantas unidades com painel solar tiveram queda de consumo?") == [
        "consumo",
        "cadastro_gd",
    ]
    assert selecionar_skills("Quais unidades estão na fila de inspeção por suspeita de gato?") == ["perdas"]


def test_roteador_ss_sem_skill_reconhecida_retorna_catalogo_resumido() -> None:
    """GENAI-23.2: Sem skill reconhecida -> núcleo + catálogo resumido (e nunca expõe cpf_cnpj/nome_titular)."""
    skills, contexto = montar_contexto_schema("Mostre os números gerais de Recife", modo="skills")
    assert skills == []
    assert "Catálogo da Camada Gold" in contexto
    assert "agg_kpis_mensal" in contexto
    assert "cpf_cnpj" not in contexto
    assert "nome_titular" not in contexto


def test_comparacao_modo_skills_vs_catalogo_inteiro() -> None:
    """GENAI-23.3: Suporta alternar entre 'skills' e 'catalogo_inteiro' para comparação no golden set."""
    skills_ss, ctx_ss = montar_contexto_schema("Qual o DEC de Recife?", modo="skills")
    skills_cat, ctx_cat = montar_contexto_schema("Qual o DEC de Recife?", modo="catalogo_inteiro")

    assert skills_ss == ["continuidade"]
    assert len(ctx_cat) > len(ctx_ss)
    assert "receita_energia_p1" in ctx_cat


def test_cache_respostas_repetidas_e_invalidacao_por_versao_gold() -> None:
    """GENAI-24: Repetir a mesma pergunta sobre a mesma versão da Gold não chama o modelo de novo."""
    limpar_cache_respostas()
    chamadas_modelo = {"n": 0}
    sql_exec = "SELECT SUM(receita_total) AS receita_brl FROM agg_kpis_mensal WHERE periodo = 'P2'"

    def executar_sql_mock(sql: str) -> ResultadoConsulta:
        return ResultadoConsulta(
            colunas=["receita_brl"],
            linhas=[[169680000.0]],
            n_linhas=1,
            sql_executado=sql,
            tabelas_usadas=["agg_kpis_mensal"],
        )

    def modelo_contado(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        chamadas_modelo["n"] += 1
        if chamadas_modelo["n"] % 2 == 1:
            return ModelResponse(
                parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": sql_exec}, tool_call_id="c1")]
            )
        saida = RespostaAgente(
            status="ok",
            pergunta_interpretada="Qual foi a receita faturada em P2?",
            plano=PlanoConsulta(tabelas=["agg_kpis_mensal"], colunas=["receita_total"], filtros=["periodo = 'P2'"]),
            sql=sql_exec,
            premissas=["Receita total em P2."],
            marcadores={"v1": 169.68},
            texto="A receita faturada em P2 foi de R$ {v1} milhões.",
            justificativa="Consulta em agg_kpis_mensal.",
            confianca="alta",
        )
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    # 1ª chamada -> vai ao modelo (2 requests: tool call + resposta final)
    r1 = responder(
        "Qual foi a receita faturada em P2?",
        modelo=FunctionModel(modelo_contado),
        executar_sql_fn=executar_sql_mock,
        gold_atualizada_em="2026-10-25T10:00:00Z",
        usar_cache=True,
    )
    assert r1["status"] == "ok"
    assert r1["detalhes_tecnicos"]["tokens_tempo"]["cache"] is False
    assert chamadas_modelo["n"] == 2

    # 2ª chamada idêntica (mesmo mudando pontuação/maiúsculas) -> vem do cache sem chamar o modelo!
    r2 = responder(
        "qual foi a receita faturada em p2",
        modelo=FunctionModel(modelo_contado),
        executar_sql_fn=executar_sql_mock,
        gold_atualizada_em="2026-10-25T10:00:00Z",
        usar_cache=True,
    )
    assert r2["status"] == "ok"
    assert r2["detalhes_tecnicos"]["tokens_tempo"]["cache"] is True
    assert r2["detalhes_tecnicos"]["tokens_tempo"]["origem"] == "resposta do cache"
    assert chamadas_modelo["n"] == 2  # Zero chamadas extras ao modelo!

    # Se tiver histórico de conversa (follow-up), NÃO usa o cache estático
    r_hist = responder(
        "qual foi a receita faturada em p2",
        historico=[TrocaHistorico(pergunta_interpretada="P1?", resposta_resumo="R$ 157 mi")],
        modelo=FunctionModel(modelo_contado),
        executar_sql_fn=executar_sql_mock,
        gold_atualizada_em="2026-10-25T10:00:00Z",
        usar_cache=True,
    )
    assert r_hist["detalhes_tecnicos"]["tokens_tempo"]["cache"] is False
    assert chamadas_modelo["n"] == 4

    # 3ª chamada após recarga da Gold (timestamp novo) -> invalida o cache e chama o modelo!
    r3 = responder(
        "Qual foi a receita faturada em P2?",
        modelo=FunctionModel(modelo_contado),
        executar_sql_fn=executar_sql_mock,
        gold_atualizada_em="2026-10-27T12:00:00Z",
        usar_cache=True,
    )
    assert r3["detalhes_tecnicos"]["tokens_tempo"]["cache"] is False
    assert chamadas_modelo["n"] == 6


def test_self_consistency_chase_sql_maioria_vence_quando_confianca_baixa() -> None:
    """GENAI-31.1 e 31.2: Com confiança baixa, dispara 2 candidatos extras e escolhe a maioria (2/3)."""
    limpar_cache_respostas()
    execucoes = {"candidato": 0, "passo_interno": 0}

    def executar_sql_por_candidato(sql: str) -> ResultadoConsulta:
        if "CANDIDATO_ERRADO" in sql:
            return ResultadoConsulta(
                colunas=["total_ucs"],
                linhas=[[999]],
                n_linhas=1,
                sql_executado=sql,
                tabelas_usadas=["tb_fila_perdas"],
            )
        return ResultadoConsulta(
            colunas=["total_ucs"],
            linhas=[[181]],
            n_linhas=1,
            sql_executado=sql,
            tabelas_usadas=["tb_fila_perdas"],
        )

    def modelo_chase_maioria(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        execucoes["passo_interno"] += 1
        # Cada candidato faz 2 chamadas (1 tool + 1 output)
        eh_chamada_tool = execucoes["passo_interno"] % 2 == 1
        idx_candidato = (execucoes["passo_interno"] - 1) // 2 + 1

        if eh_chamada_tool:
            sql = (
                "SELECT COUNT(*) AS total_ucs FROM tb_fila_perdas -- CANDIDATO_ERRADO"
                if idx_candidato == 1
                else "SELECT COUNT(*) AS total_ucs FROM tb_fila_perdas"
            )
            return ModelResponse(
                parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": sql}, tool_call_id=f"c_{idx_candidato}")]
            )

        valor = 999 if idx_candidato == 1 else 181
        saida = RespostaAgente(
            status="ok",
            pergunta_interpretada="Quantas UCs estão na fila de perdas?",
            plano=PlanoConsulta(tabelas=["tb_fila_perdas"], colunas=["total_ucs"], filtros=[]),
            sql=(
                "SELECT COUNT(*) AS total_ucs FROM tb_fila_perdas -- CANDIDATO_ERRADO"
                if idx_candidato == 1
                else "SELECT COUNT(*) AS total_ucs FROM tb_fila_perdas"
            ),
            premissas=["Contagem de UCs na fila de perdas em P2."],
            marcadores={"v1": valor},
            texto="Existem {v1} UCs na fila de perdas em P2.",
            justificativa="Votação CHASE-SQL.",
            confianca="baixa",
        )
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    resp = responder(
        "Quantas UCs estão na fila de perdas?",
        modelo=FunctionModel(modelo_chase_maioria),
        executar_sql_fn=executar_sql_por_candidato,
        usar_cache=False,
        usar_self_consistency=True,
    )

    # Candidato 1 deu 999, mas Candidatos 2 e 3 deram 181 -> maioria (2/3) vence com 181!
    assert resp["status"] == "ok"
    assert "181" in resp["resposta"]
    assert resp["detalhes_tecnicos"]["verificacoes"]["self_consistency_votos"] == "2/3"


def test_self_consistency_chase_sql_sem_maioria_vira_nao_sei() -> None:
    """GENAI-31.3: Se os 3 candidatos derem resultados diferentes (sem maioria), retorna status='nao_sei'."""
    limpar_cache_respostas()
    passo = {"n": 0}

    def executar_sql_divergente(sql: str) -> ResultadoConsulta:
        val = int(sql.split()[1])
        return ResultadoConsulta(
            colunas=["valor"],
            linhas=[[val]],
            n_linhas=1,
            sql_executado=sql,
            tabelas_usadas=["agg_kpis_mensal"],
        )

    def modelo_divergente(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        passo["n"] += 1
        eh_tool = passo["n"] % 2 == 1
        idx_cand = (passo["n"] - 1) // 2 + 1
        val = idx_cand * 100  # 100, 200, 300 (todos diferentes!)
        sql = f"SELECT {val} AS valor"

        if eh_tool:
            return ModelResponse(
                parts=[ToolCallPart(tool_name="consultar_gold", args={"sql": sql}, tool_call_id=f"d_{idx_cand}")]
            )

        saida = RespostaAgente(
            status="ok",
            pergunta_interpretada="Pergunta ambígua",
            plano=PlanoConsulta(tabelas=["agg_kpis_mensal"], colunas=["valor"], filtros=[]),
            sql=sql,
            premissas=[],
            marcadores={"v1": val},
            texto="O valor é {v1} em P2.",
            justificativa="Ambíguo.",
            confianca="baixa",
        )
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    resp = responder(
        "Qual o indicador daquele período?",
        modelo=FunctionModel(modelo_divergente),
        executar_sql_fn=executar_sql_divergente,
        usar_cache=False,
        usar_self_consistency=True,
    )

    assert resp["status"] == "nao_sei"
    assert resp["sql"] is None
    assert "divergentes" in resp["resposta"]
