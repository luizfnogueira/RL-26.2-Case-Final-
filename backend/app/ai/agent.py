"""Agente Gerador Text-to-SQL (Candidate Generator — CG do CHESS) com PydanticAI (GENAI-9, 13, 14).

Implementa:
- Montagem de instruções com regras críticas no início e no fim do contexto (mitigação de lost-in-the-middle).
- Regra mandatória contra consumo negativo (sempre filtrar `flag_consumo_negativo = FALSE` e
  `consumo_kwh_valido >= 0`, salvo pedido explícito do usuário sobre erro de medidor / consumo negativo).
- Três ferramentas sob controle de UsageLimits(request_limit=6):
  1. `consultar_gold(sql)` — valida e executa a query; levanta ModelRetry até 2x em erro de SQL ou
     ausência de filtro de consumo negativo; encerra sem retry em SQLBloqueado.
  2. `valores_distintos(tabela, coluna)` — Information Retriever (IR do CHESS) restrito a colunas categóricas.
  3. `descrever_tabela(tabela)` — consulta de schema sob demanda.
"""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.usage import UsageLimits

from app.ai.contratos import (
    DepsAgente,
    ErroConsulta,
    ModoApresentacao,
    PlanoConsulta,
    RespostaAgente,
    ResultadoConsulta,
    SQLBloqueado,
    TrocaHistorico,
)
from app.ai.modelo import criar_modelo, obter_model_settings, obter_nome_modelo, obter_provedor_configurado
from app.ai.telemetria import construir_telemetria, montar_detalhes_tecnicos
from app.db.gold_contract import COLUMNS

SKILLS_DIR = Path(__file__).resolve().parent / "skills"

COLUNAS_CATEGORICAS_PERMITIDAS: dict[str, set[str]] = {
    "dim_uc": {"municipio", "bairro", "classe", "subgrupo_tarifario", "status", "tipo_medidor", "gd_modalidade"},
    "agg_receita_mensal": {"municipio", "bairro", "classe"},
    "agg_preco_volume": {"municipio", "bairro", "classe"},
    "agg_kpis_mensal": {"periodo", "bandeira_tarifaria"},
    "agg_dec_fec_mensal": {"municipio", "periodo", "alimentador"},
    "fato_uc_mes": {"bandeira_tarifaria", "status", "tipo_leitura"},
    "uc_interrupcoes": {"tipo", "causa", "alimentador"},
    "uc_atendimentos": {"canal", "assunto", "subassunto"},
    "tb_fila_perdas": {"municipio", "bairro", "classe", "acao_recomendada", "confianca_evidencia", "status_triagem"},
}

PADROES_PEDIDO_CONSUMO_NEGATIVO = re.compile(
    r"(consumo\s+negativo|consumos\s+negativos|leitura[s]?\s+negativa[s]?|"
    r"flag_consumo_negativo|medidor\s+deu\s+erro.*negativ|erro[s]?\s+de\s+medidor.*negativ|"
    r"menor\s+que\s+zero\s+no\s+medidor|kwh\s+negativo)",
    re.IGNORECASE,
)

REGRAS_CRITICAS_TOPO = """
=== REGRAS CRÍTICAS INEGOCIÁVEIS (LEIA PRIMEIRO) ===
1. SOMENTE LEITURA: Gere exclusivamente consultas SQL `SELECT` sobre as views da camada Gold. Jamais tente `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER` ou funções administrativas.
2. PROIBIÇÃO DE CONSUMO NEGATIVO EM CONSULTAS NORMAIS (REGRA DE NEGÓCIO CRÍTICA):
   - Na tabela `fato_uc_mes`, há leituras com erro de medidor que resultaram em consumo negativo e ficaram marcadas com `flag_consumo_negativo = TRUE`.
   - Em QUALQUER pergunta normal sobre consumo (ex.: "qual foi o menor consumo do mês?", "média de consumo", "soma de consumo", "ranking de consumo"):
     * NUNCA exiba um consumo negativo para o usuário.
     * Em `fato_uc_mes`, use SEMPRE `consumo_kwh_valido` e inclua no `WHERE`: `flag_consumo_negativo = FALSE AND consumo_kwh_valido IS NOT NULL AND consumo_kwh_valido >= 0` (e `consumo_kwh_valido > 0` ao buscar o menor consumo positivo de uma UC ativa).
     * Em `uc_consumo_comparativo`, inclua no `WHERE`: `consumo_kwh >= 0`.
   - EXCEÇÃO ÚNICA: Só consulte `flag_consumo_negativo = TRUE` ou `consumo_kwh < 0` se o usuário pedir EXPLICITAMENTE os casos em que o medidor deu erro / gerou consumo negativo.
3. ZERO INVENÇÃO DE NÚMEROS:
   - Sempre chame a ferramenta `consultar_gold` antes de responder com números.
   - No campo `texto`, referencie os números retornados pelo banco usando marcadores `{v1}`, `{v2}` e preencha o dicionário `marcadores` com os valores exatos das células (ex.: `{"v1": 169680000.0, "v2": -2.09}`).
   - Se a consulta retornar vazio, se o período for fora de jul/2022 a jun/2026 ou se a pergunta for fora do escopo da V-Energy, devolva `status="nao_sei"` explicando o motivo.
4. CORREÇÃO DE PREMISSA FALSA:
   - Se a pergunta contiver uma premissa contrária aos dados (ex.: "Quanto a receita comercial cresceu em Jaboatão?", quando na verdade caiu 2,09% de P1 para P2), corrija a premissa de forma clara no texto usando os números reais da consulta.
5. DADOS PESSOAIS PROTEGIDOS:
   - O agente não tem acesso a `cpf_cnpj`, `nome_titular` ou endereço detalhado. Se pedirem titular ou CPF, recuse com `status="bloqueado"`.
""".strip()

REGRAS_CRITICAS_RODAPE = """
=== LEMBRETE FINAL ANTES DE GERAR O PLANO E O SQL ===
- Preencha primeiro o `plano` (`PlanoConsulta`) com tabelas, colunas, filtros, agregação, ordenação, limite e período.
- Se consultar `fato_uc_mes` ou `uc_consumo_comparativo` para consumo normal (especialmente `MIN`, menor consumo, média ou ranking), garanta `flag_consumo_negativo = FALSE` e `consumo_kwh_valido >= 0` (ou `> 0` para menor consumo de UC ativa). NUNCA mostre consumo negativo salvo pedido explícito de erro de medidor!
- Cite sempre o período (ex.: P1 = jul/2022 a jun/2023; P2 = jul/2025 a jun/2026), a unidade (R$, kWh, %, h/UC) e a métrica (ex.: receita de energia sem tributos vs. receita faturada com tributos).
""".strip()


def detectar_pedido_consumo_negativo_explicito(pergunta: str) -> bool:
    """Retorna True somente se o usuário pediu explicitamente casos de erro/consumo negativo."""
    return bool(PADROES_PEDIDO_CONSUMO_NEGATIVO.search(pergunta or ""))


def carregar_texto_skills(nomes_skills: list[str] | None = None) -> str:
    """Carrega o conteúdo Markdown das skills selecionadas em backend/app/ai/skills/."""
    if not SKILLS_DIR.exists():
        return ""
    arquivos: list[Path] = []
    if nomes_skills:
        for nome in nomes_skills:
            caminho = SKILLS_DIR / f"{nome}.md"
            if caminho.exists():
                arquivos.append(caminho)
    if not arquivos:
        padrao_receita = SKILLS_DIR / "receita.md"
        if padrao_receita.exists():
            arquivos.append(padrao_receita)
    blocos = [arq.read_text(encoding="utf-8").strip() for arq in arquivos]
    return "\n\n---\n\n".join(blocos)


def montar_contexto_instrucoes(deps: DepsAgente) -> str:
    """Monta o prompt completo com regras críticas nas pontas + skills + entidades (CHESS)."""
    partes = [REGRAS_CRITICAS_TOPO]

    texto_skills = deps.contexto_skills or carregar_texto_skills(deps.skills_ativas)
    if texto_skills:
        partes.append(f"=== CONHECIMENTO DO DOMÍNIO (SKILLS ATIVAS) ===\n{texto_skills}")

    if deps.entidades_resolvidas:
        partes.append(
            f"=== ENTIDADES E VALORES RECONHECIDOS NO BANCO (IR DO CHESS) ===\n{deps.entidades_resolvidas}"
        )

    if deps.consumo_negativo_solicitado:
        partes.append(
            "NOTA DE CONTEXTO: Nesta pergunta específica, o usuário pediu explicitamente "
            "para investigar casos de erro de medidor / consumo negativo (`flag_consumo_negativo = TRUE`)."
        )
    else:
        partes.append(
            "NOTA DE CONTEXTO: O usuário NÃO pediu erros de medidor. É ESTRITAMENTE PROIBIDO "
            "retornar ou exibir consumo negativo. Aplique `flag_consumo_negativo = FALSE`."
        )

    partes.append(REGRAS_CRITICAS_RODAPE)
    return "\n\n".join(partes)


def validar_regra_consumo_negativo_no_sql(sql: str, consumo_negativo_solicitado: bool) -> None:
    """Verifica se uma query sobre `fato_uc_mes` ou `uc_consumo_comparativo` respeita a regra de consumo negativo."""
    if consumo_negativo_solicitado:
        return

    sql_lower = (sql or "").lower()
    toca_fato_uc = "fato_uc_mes" in sql_lower
    toca_comparativo = "uc_consumo_comparativo" in sql_lower

    if toca_fato_uc and "consumo" in sql_lower:
        tem_filtro_flag = "flag_consumo_negativo" in sql_lower and (
            "false" in sql_lower or "= 0" in sql_lower or "is false" in sql_lower
        )
        tem_filtro_positivo = bool(
            re.search(r"consumo_kwh(_valido)?\s*(>=|>)\s*0", sql_lower)
        )
        usa_consumo_bruto_sem_valido = (
            re.search(r"\bconsumo_kwh\b", sql_lower) is not None
            and "consumo_kwh_valido" not in sql_lower
        )
        if usa_consumo_bruto_sem_valido:
            raise ErroConsulta(
                "Regra de negócio violada: em `fato_uc_mes`, use `consumo_kwh_valido` em vez de `consumo_kwh` "
                "e adicione `WHERE flag_consumo_negativo = FALSE AND consumo_kwh_valido >= 0`."
            )
        if not (tem_filtro_flag or tem_filtro_positivo):
            raise ErroConsulta(
                "Regra de negócio violada: toda consulta de consumo em `fato_uc_mes` deve filtrar "
                "`flag_consumo_negativo = FALSE AND consumo_kwh_valido >= 0` (ou `> 0` para menor consumo) "
                "para nunca exibir consumos negativos."
            )

    if toca_comparativo and "consumo_kwh" in sql_lower:
        tem_filtro_comp = bool(re.search(r"consumo_kwh\s*(>=|>)\s*0", sql_lower))
        if not tem_filtro_comp and "flag_conta_alta" not in sql_lower:
            raise ErroConsulta(
                "Regra de negócio violada: ao consultar consumo em `uc_consumo_comparativo`, "
                "adicione filtro `consumo_kwh >= 0` para excluir leituras negativas."
            )


def descrever_tabela_padrao(tabela: str) -> str:
    """Retorna as colunas e chaves da tabela a partir do contrato oficial da Gold."""
    nome_limpo = tabela.strip().lower().removeprefix("gold.").removeprefix("agente.")
    if nome_limpo not in COLUMNS:
        disponiveis = ", ".join(sorted(COLUMNS.keys()))
        return f"Tabela {tabela!r} não existe na Gold. Tabelas disponíveis: {disponiveis}"
    cols = ", ".join(COLUMNS[nome_limpo])
    return f"Tabela `{nome_limpo}` — Colunas: {cols}"


def valores_distintos_padrao(tabela: str, coluna: str) -> list[str]:
    """Implementação padrão segura para `valores_distintos` quando o banco não está conectado."""
    nome_limpo = tabela.strip().lower().removeprefix("gold.").removeprefix("agente.")
    col_limpa = coluna.strip().lower()
    permitidas = COLUNAS_CATEGORICAS_PERMITIDAS.get(nome_limpo, set())
    if col_limpa not in permitidas:
        raise ValueError(
            f"Coluna {col_limpa!r} da tabela {nome_limpo!r} não é categórica ou não está liberada para busca de valores."
        )
    if col_limpa == "classe":
        return ["COMERCIAL", "INDUSTRIAL", "PODER PUBLICO", "RESIDENCIAL", "RURAL"]
    if col_limpa == "municipio":
        return [
            "ABREU E LIMA",
            "ARAÇOIABA",
            "CABO DE SANTO AGOSTINHO",
            "CAMARAGIBE",
            "IGARASSU",
            "ILHA DE ITAMARACÁ",
            "IPOJUCA",
            "ITAPISSUMA",
            "JABOATÃO DOS GUARARAPES",
            "MORENO",
            "OLINDA",
            "PAULISTA",
            "RECIFE",
            "SÃO LOURENÇO DA MATA",
        ]
    if col_limpa == "acao_recomendada":
        return ["INSPECAO_PRIORITARIA", "VALIDACAO_DOCUMENTAL"]
    return []


def converter_historico_para_mensagens(historico: list[TrocaHistorico | dict[str, Any]] | None) -> list[ModelMessage]:
    """Converte as até 3 últimas trocas em pares user/model do PydanticAI (GENAI-13)."""
    if not historico:
        return []

    ultimas = historico[-3:]
    mensagens: list[ModelMessage] = []
    for item in ultimas:
        troca = item if isinstance(item, TrocaHistorico) else TrocaHistorico.model_validate(item)
        mensagens.append(ModelRequest(parts=[UserPromptPart(content=troca.pergunta_interpretada)]))
        resumo_curto = (troca.resposta_resumo or "")[:300]
        bloco_modelo = f"Resumo: {resumo_curto}"
        if troca.sql_executado:
            bloco_modelo += f"\nSQL executado: {troca.sql_executado}"
        mensagens.append(ModelResponse(parts=[TextPart(content=bloco_modelo)]))
    return mensagens


def decidir_apresentacao(status: str, resultado: ResultadoConsulta | None) -> ModoApresentacao:
    """Decide deterministicamente se a resposta vai como 'texto' ou 'tabela' (GENAI-14)."""
    if status != "ok" or resultado is None or resultado.bloqueado:
        return "texto"
    if resultado.n_linhas > 1:
        return "tabela"
    if resultado.n_linhas == 1 and len(resultado.colunas) > 2:
        return "tabela"
    return "texto"


def construir_agente_sql(modelo: Model | None = None) -> Agent[DepsAgente, RespostaAgente]:
    """Constrói o Agent PydanticAI do Candidate Generator (CG do CHESS)."""
    modelo_efetivo = modelo or criar_modelo("sql", permitir_fallback_teste=True)
    agente = Agent(
        modelo_efetivo,
        deps_type=DepsAgente,
        output_type=RespostaAgente,
        model_settings=obter_model_settings("sql"),
        retries=2,
    )

    @agente.instructions
    def _instrucoes(ctx: RunContext[DepsAgente]) -> str:
        return montar_contexto_instrucoes(ctx.deps)

    @agente.tool
    def consultar_gold(ctx: RunContext[DepsAgente], sql: str) -> dict[str, Any]:
        """Executa uma consulta SQL SELECT somente leitura na camada Gold e devolve colunas e linhas."""
        ctx.deps.tentativas_sql += 1
        try:
            validar_regra_consumo_negativo_no_sql(sql, ctx.deps.consumo_negativo_solicitado)
            if ctx.deps.executar_sql_fn is None:
                raise ErroConsulta("Função de consulta ao banco não configurada.")
            resultado = ctx.deps.executar_sql_fn(sql)
        except SQLBloqueado as exc:
            ctx.deps.bloqueio = exc.motivo
            bloqueado_res = ResultadoConsulta.bloqueada(exc.motivo, sql=sql)
            ctx.deps.ultimo_resultado = bloqueado_res
            return bloqueado_res.model_dump()
        except ErroConsulta as exc:
            raise ModelRetry(str(exc)) from exc

        # Verifica se o resultado contém algum consumo negativo quando o usuário não pediu
        if not ctx.deps.consumo_negativo_solicitado and resultado.colunas and resultado.linhas:
            indices_consumo = [
                idx
                for idx, col in enumerate(resultado.colunas)
                if "consumo" in col.lower() or "menor_consumo" in col.lower()
            ]
            for linha in resultado.linhas:
                for idx in indices_consumo:
                    valor = linha[idx] if idx < len(linha) else None
                    if isinstance(valor, (int, float)) and valor < 0:
                        raise ModelRetry(
                            "O resultado trouxe valor de consumo negativo, o que é proibido para perguntas normais. "
                            "Refaça a query filtrando `flag_consumo_negativo = FALSE AND consumo_kwh_valido >= 0`."
                        )

        ctx.deps.ultimo_sql = sql
        ctx.deps.ultimo_resultado = resultado
        ctx.deps.historico_resultados.append(resultado)
        return {
            "colunas": resultado.colunas,
            "linhas": resultado.linhas[:50],
            "n_linhas": resultado.n_linhas,
            "truncado": resultado.truncado or (len(resultado.linhas) > 50),
        }

    @agente.tool
    def valores_distintos(ctx: RunContext[DepsAgente], tabela: str, coluna: str) -> list[str]:
        """Retorna até 30 valores distintos de uma coluna categórica permitida (município, bairro, classe, etc.)."""
        fn = ctx.deps.valores_distintos_fn or valores_distintos_padrao
        try:
            valores = fn(tabela, coluna)
        except Exception as exc:
            raise ModelRetry(str(exc)) from exc
        return list(valores)[:30]

    @agente.tool
    def descrever_tabela(ctx: RunContext[DepsAgente], tabela: str) -> str:
        """Descreve as colunas disponíveis em uma tabela da camada Gold."""
        fn = ctx.deps.descrever_tabela_fn or descrever_tabela_padrao
        return fn(tabela)

    return agente


def formatar_marcadores_no_texto(texto: str, marcadores: dict[str, str | int | float]) -> str:
    """Substitui marcadores `{v1}`, `{v2}` no texto caso o modelo os tenha deixado em formato de template."""
    if not marcadores or not texto:
        return texto
    texto_final = texto
    for chave, valor in marcadores.items():
        placeholder = "{" + str(chave).strip("{}") + "}"
        if isinstance(valor, float):
            valor_fmt = f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        else:
            valor_fmt = str(valor)
        texto_final = texto_final.replace(placeholder, valor_fmt)
    return texto_final


def responder(
    pergunta: str,
    *,
    historico: list[TrocaHistorico | dict[str, Any]] | None = None,
    conversa_id: str | None = None,
    modelo: Model | None = None,
    executar_sql_fn: Any | None = None,
    valores_distintos_fn: Any | None = None,
    descrever_tabela_fn: Any | None = None,
    skills_ativas: list[str] | None = None,
    entidades_resolvidas: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Função principal do agente do Théo: recebe a pergunta e devolve o dicionário compatível com RespostaIA."""
    inicio_total = time.perf_counter()
    etapas_ms: dict[str, int] = {}

    t0 = time.perf_counter()
    consumo_neg_explicito = detectar_pedido_consumo_negativo_explicito(pergunta)
    skills = skills_ativas or ["receita"]
    deps = DepsAgente(
        pergunta_original=pergunta,
        skills_ativas=skills,
        contexto_skills=carregar_texto_skills(skills),
        entidades_resolvidas=entidades_resolvidas or {},
        consumo_negativo_solicitado=consumo_neg_explicito,
        executar_sql_fn=executar_sql_fn,
        valores_distintos_fn=valores_distintos_fn,
        descrever_tabela_fn=descrever_tabela_fn,
    )
    msgs_historico = converter_historico_para_mensagens(historico)
    etapas_ms["preparacao_ms"] = int((time.perf_counter() - t0) * 1000)

    t_agente = time.perf_counter()
    agente = construir_agente_sql(modelo=modelo)
    resultado_run = agente.run_sync(
        pergunta,
        deps=deps,
        message_history=msgs_historico,
        usage_limits=UsageLimits(request_limit=6),
    )
    etapas_ms["agente_ms"] = int((time.perf_counter() - t_agente) * 1000)

    saida: RespostaAgente = resultado_run.output

    # Se houve bloqueio determinístico na ferramenta consultar_gold, força status="bloqueado"
    if deps.bloqueio:
        saida = saida.model_copy(
            update={
                "status": "bloqueado",
                "sql": None,
                "texto": f"Consulta bloqueada pelas regras de segurança: {deps.bloqueio}",
            }
        )

    sql_final = saida.sql or deps.ultimo_sql
    if saida.status == "ok" and sql_final != saida.sql:
        saida = saida.model_copy(update={"sql": sql_final})

    texto_renderizado = formatar_marcadores_no_texto(saida.texto, saida.marcadores)
    ultimo_res = deps.ultimo_resultado

    if saida.status == "ok" and ultimo_res and not ultimo_res.bloqueado:
        colunas_resp = list(ultimo_res.colunas)
        linhas_resp = [list(linha) for linha in ultimo_res.linhas[:50]]
        tabelas_resp = list(
            ultimo_res.tabelas_usadas
            or (saida.plano.tabelas if saida.plano and saida.plano.tabelas else [])
        )
        n_linhas_real = ultimo_res.n_linhas
    else:
        colunas_resp = []
        linhas_resp = []
        tabelas_resp = []
        n_linhas_real = 0

    apresentacao = decidir_apresentacao(saida.status, ultimo_res)
    latencia_total_ms = int((time.perf_counter() - inicio_total) * 1000)

    telemetria = construir_telemetria(
        resultado_run=resultado_run,
        deps=deps,
        saida=saida,
        modelo_nome=obter_nome_modelo("sql"),
        provedor_nome=obter_provedor_configurado(),
        latencia_total_ms=latencia_total_ms,
        etapas_ms=etapas_ms,
    )
    detalhes = montar_detalhes_tecnicos(saida, telemetria, n_linhas=n_linhas_real)

    payload: dict[str, Any] = {
        "resposta": texto_renderizado,
        "sql": saida.sql if saida.status == "ok" else None,
        "tabelas": tabelas_resp if saida.status == "ok" else [],
        "dados": {
            "colunas": colunas_resp,
            "linhas": linhas_resp,
        },
        "status": saida.status,
        "gerado_em": datetime.now(timezone.utc),
        "metadados": {
            "dados_ficticios": False,
            "gold_atualizada_em": None,
            "observacoes": list(saida.premissas),
        },
        "apresentacao": apresentacao,
        "detalhes_tecnicos": detalhes,
    }
    if conversa_id is not None:
        payload["conversa_id"] = conversa_id
    return payload
