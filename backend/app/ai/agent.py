"""Agente Gerador Text-to-SQL (Candidate Generator — CG do CHESS) com PydanticAI (GENAI-9, 10, 13, 14, 17, 23, 24, 31).

Implementa o pipeline completo sob responsabilidade de Théo:
1. Cache de respostas repetidas (GENAI-24), invalidado por `gold_atualizada_em`.
2. Schema Selector por skills (SS do CHESS — GENAI-23) e alternância com `catalogo_inteiro`.
3. Candidate Generator (CG do CHESS — GENAI-9): plano estruturado, 3 ferramentas, UsageLimits(request_limit=6),
   auto-correção via ModelRetry e proteção rigorosa contra consumo negativo (`flag_consumo_negativo = FALSE`).
4. Validador determinístico de saída e marcadores pt-BR (`@agente.output_validator` — GENAI-10).
5. Suporte a `message_history` para perguntas de follow-up (GENAI-13) e decisão `texto` vs `tabela` (GENAI-14).
6. Self-consistency seletiva por votação no resultado de execução (CHASE-SQL simplificado — GENAI-31).
7. Telemetria completa extraída de `result.usage()` e `result.all_messages()` (GENAI-17).
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic_ai import Agent, ModelRetry, RunContext, UnexpectedModelBehavior, UsageLimitExceeded
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.usage import UsageLimits

from app.ai.cache import buscar_resposta_em_cache, salvar_resposta_em_cache
from app.ai.chase import executar_votacao_chase_sql, precisa_disparar_self_consistency
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
from app.ai.resposta import (
    ViolacaoFidelidadeSaida,
    complementar_texto_para_tabela,
    decidir_modo_apresentacao,
    enriquecer_avisos_e_premissas,
    substituir_marcadores_pt_br,
    validar_fidelidade_saida,
)
from app.ai.roteador import ModoSchema, montar_contexto_schema
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
3. ZERO INVENÇÃO DE NÚMEROS E MARCADORES `{v1}` (GENAI-10):
   - Sempre chame a ferramenta `consultar_gold` antes de responder com números.
   - No campo `texto`, referencie os números retornados pelo banco usando marcadores `{v1}`, `{v2}` e preencha o dicionário `marcadores` com os valores exatos das células retornadas (ex.: `{"v1": 169680000.0, "v2": -2.09}`).
   - Não escreva números soltos fora dos marcadores que não estejam nos dados da consulta.
   - Se a consulta retornar vazio, se o período for fora de jul/2022 a jun/2026 ou se a pergunta for fora do escopo da V-Energy, devolva `status="nao_sei"` explicando o motivo.
4. CORREÇÃO DE PREMISSA FALSA (GENAI-10.4):
   - Se a pergunta contiver uma premissa contrária aos dados (ex.: "Quanto a receita comercial cresceu em Jaboatão?", quando na verdade caiu 2,09% de P1 para P2), corrija a premissa de forma explícita no texto informando que houve queda/redução.
5. CONTINUAÇÃO DE CONVERSA / FOLLOW-UP (GENAI-13):
   - Quando houver histórico na conversa (ex.: usuário pergunta "E só comercial?", "E em Olinda?", "E no ano anterior?"), herde da troca anterior os filtros não repetidos (métrica, município, bairro, classe ou período), registre essa herança em `premissas` e escreva a `pergunta_interpretada` completa e autossuficiente.
   - Você só recebe as últimas 3 trocas respondidas da conversa (das últimas 2 horas); perguntas mais antigas, recusadas ou sem resposta não chegam até você. A troca mais antiga que você vê NÃO é necessariamente a primeira da conversa.
   - Se a pessoa perguntar por algo de antes dessas trocas (ex.: "a primeira pergunta que eu fiz", "o primeiro município que perguntei", "o que perguntei no início"), não presuma: responda com `status="nao_sei"`, diga que você só lembra das últimas 3 perguntas, cite a mais antiga que você vê e peça para a pessoa repetir o que quer consultar.
6. ALIASES SQL E TABELAS (GENAI-14):
   - Use aliases legíveis e com unidade nas colunas do SQL (ex.: `receita_energia_brl`, `consumo_valido_kwh`, `dec_horas_uc`, `variacao_pct`).
   - Quando o resultado for um ranking ou lista (várias linhas), mencione no texto o período, a unidade e o destaque do 1º lugar.
7. DADOS PESSOAIS PROTEGIDOS:
   - O agente não tem acesso a `cpf_cnpj`, `nome_titular` ou endereço detalhado. Se pedirem titular ou CPF, recuse com `status="bloqueado"`.
8. DEC E FEC DE UM PERÍODO (REGRA DE NEGÓCIO CRÍTICA):
   - O DEC e o FEC de cada mês já são médias por UC. O DEC (ou FEC) de um período (P1, P2, um ano) é a SOMA dos meses: use `SUM(dec)`, nunca `AVG(dec)`.
   - "DEC médio de P2" é o DEC de P2: responda com a soma dos meses e explique que o DEC já é uma média por UC. Só use a média mensal se a pergunta pedir "por mês", "mensal" ou "média mensal".
   - Sistema inteiro: some os meses de `agg_kpis_mensal`. Por alimentador: some os meses de `agg_dec_fec_mensal` agrupando por `alimentador`.
   - Nunca some o DEC de alimentadores diferentes no mesmo mês: o DEC de um grupo de alimentadores (ex.: um município) é `SUM(dec * ucs_atendidas) / SUM(ucs_atendidas)` em cada mês, e depois a soma dos meses.
9. P1 E P2 SÃO PERÍODOS FIXOS:
   - P1 = 2022-07 a 2023-06 e P2 = 2025-07 a 2026-06, sempre esses meses ("P1" não é "o ano anterior ao P2").
   - Nas tabelas com coluna `periodo` (`dim_mes`, `agg_kpis_mensal`, `agg_dec_fec_mensal`), filtre `periodo = 'P1'`; nas outras, use `mes_referencia BETWEEN '2022-07' AND '2023-06'` (P1) ou `BETWEEN '2025-07' AND '2026-06'` (P2).
""".strip()

REGRAS_CRITICAS_RODAPE = """
=== LEMBRETE FINAL ANTES DE GERAR O PLANO E O SQL ===
- Preencha primeiro o `plano` (`PlanoConsulta`) com tabelas, colunas, filtros, agregação, ordenação, limite e período.
- Se consultar `fato_uc_mes` ou `uc_consumo_comparativo` para consumo normal (especialmente `MIN`, menor consumo, média ou ranking), garanta `flag_consumo_negativo = FALSE` e `consumo_kwh_valido >= 0` (ou `> 0` para menor consumo de UC ativa). NUNCA mostre consumo negativo salvo pedido explícito de erro de medidor!
- DEC/FEC de um período é `SUM` dos meses, nunca `AVG` (salvo pedido explícito de média mensal).
- Cite sempre o período (ex.: P1 = jul/2022 a jun/2023; P2 = jul/2025 a jun/2026), a unidade (R$, kWh, %, h/UC) e a métrica (ex.: receita de energia sem tributos vs. receita faturada com tributos).
- Todos os números citados no `texto` devem estar declarados em `marcadores` (`{v1}`, `{v2}`) e bater com o resultado de `consultar_gold`.
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
        partes.append(f"=== CONHECIMENTO DO DOMÍNIO (SKILLS E SCHEMA SELECIONADOS) ===\n{texto_skills}")

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


PEDIDO_MEDIA_MENSAL = re.compile(r"por\s+m[eê]s|mensal|m[eê]s\s+a\s+m[eê]s|cada\s+m[eê]s", re.IGNORECASE)


def validar_regra_dec_fec_no_sql(sql: str, pergunta: str) -> None:
    """DEC/FEC de um período é a soma dos meses (contrato de dados, seção 4); a média só com pedido explícito."""
    usa_media = re.search(r"\bavg\s*\(\s*(?:\w+\.)?(?:dec|fec)(?:_sem_dia_critico)?\s*\)", (sql or "").lower())
    if usa_media and not PEDIDO_MEDIA_MENSAL.search(pergunta or ""):
        raise ErroConsulta(
            "Regra de negócio violada: o DEC/FEC de um período é a SOMA dos meses (`SUM(dec)`), nunca `AVG(dec)`. "
            "O DEC mensal já é uma média por UC. Para um grupo de alimentadores, pondere pelas UCs em cada mês "
            "(`SUM(dec * ucs_atendidas) / SUM(ucs_atendidas)`) e depois some os meses."
        )


MESES_DOS_PERIODOS = {"p1": ("2022-07", "2023-06"), "p2": ("2025-07", "2026-06")}


def validar_regra_periodo_no_sql(sql: str, pergunta: str) -> None:
    """P1/P2 citado na pergunta tem de aparecer no SQL como `periodo = 'P1'` ou pelos meses exatos do período."""
    sql_lower = (sql or "").lower()
    if "agg_preco_volume" in sql_lower:  # já vem com colunas por período (receita_energia_p1, kwh_p2)
        return
    for periodo in sorted(set(re.findall(r"\bp[12]\b", (pergunta or "").lower()))):
        inicio, fim = MESES_DOS_PERIODOS[periodo]
        if f"'{periodo}'" not in sql_lower and not (inicio in sql_lower and fim in sql_lower):
            raise ErroConsulta(
                f"Regra de negócio violada: {periodo.upper()} é de {inicio} a {fim}. Filtre "
                f"`periodo = '{periodo.upper()}'` ou `mes_referencia BETWEEN '{inicio}' AND '{fim}'`."
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
        resumo_curto = (troca.resposta_resumo or "").strip()[:300]
        partes_modelo = [f"Resumo: {resumo_curto}"]
        if troca.filtros:
            partes_modelo.append(f"Filtros ativos: {troca.filtros}")
        if troca.sql_executado:
            partes_modelo.append(f"SQL executado: {troca.sql_executado}")
        mensagens.append(ModelResponse(parts=[TextPart(content="\n".join(partes_modelo))]))
    return mensagens


def decidir_apresentacao(status: str, resultado: ResultadoConsulta | None) -> ModoApresentacao:
    """Alias para `decidir_modo_apresentacao` (GENAI-14)."""
    return decidir_modo_apresentacao(status, resultado)


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
            validar_regra_dec_fec_no_sql(sql, ctx.deps.pergunta_original)
            validar_regra_periodo_no_sql(sql, ctx.deps.pergunta_original)
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
                if "consumo" in col.lower()
                and "variacao" not in col.lower()
                and "queda" not in col.lower()
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

    @agente.output_validator
    def _validar_saida(ctx: RunContext[DepsAgente], saida: RespostaAgente) -> RespostaAgente:
        """Valida marcadores, números e regras de domínio (GENAI-10.2)."""
        try:
            return validar_fidelidade_saida(ctx.deps, saida)
        except ViolacaoFidelidadeSaida as exc:
            ctx.deps.tentativas_validacao_saida += 1
            if ctx.deps.tentativas_validacao_saida <= 1:
                raise ModelRetry(str(exc)) from exc
            return saida.model_copy(
                update={
                    "status": "nao_sei",
                    "sql": None,
                    "marcadores": {},
                    "texto": (
                        "Não foi possível confirmar os números da resposta com precisão suficiente "
                        "a partir dos dados consultados na camada Gold."
                    ),
                    "justificativa": f"Validação de fidelidade reprovada após retry: {exc}",
                    "confianca": "baixa",
                }
            )

    return agente


def formatar_marcadores_no_texto(texto: str, marcadores: dict[str, str | int | float]) -> str:
    """Substitui marcadores `{v1}`, `{v2}` com formatação pt-BR (GENAI-10.1)."""
    return substituir_marcadores_pt_br(texto, marcadores)


def _executar_uma_vez(
    pergunta: str,
    *,
    msgs_historico: list[ModelMessage],
    skills_selecionadas: list[str],
    contexto_skills: str,
    consumo_neg_explicito: bool,
    entidades_resolvidas: dict[str, Any],
    modelo: Model | None,
    executar_sql_fn: Any | None,
    valores_distintos_fn: Any | None,
    descrever_tabela_fn: Any | None,
    gold_atualizada_em: datetime | str | None,
    conversa_id: str | None,
    etapas_base_ms: dict[str, int],
    inicio_total: float,
) -> dict[str, Any]:
    """Executa um passe completo do Candidate Generator (CG) + Validação + Telemetria."""
    etapas_ms = dict(etapas_base_ms)
    deps = DepsAgente(
        pergunta_original=pergunta,
        skills_ativas=skills_selecionadas,
        contexto_skills=contexto_skills,
        entidades_resolvidas=entidades_resolvidas,
        consumo_negativo_solicitado=consumo_neg_explicito,
        executar_sql_fn=executar_sql_fn,
        valores_distintos_fn=valores_distintos_fn,
        descrever_tabela_fn=descrever_tabela_fn,
    )

    t_agente = time.perf_counter()
    agente = construir_agente_sql(modelo=modelo)
    try:
        resultado_run = agente.run_sync(
            pergunta,
            deps=deps,
            message_history=msgs_historico,
            usage_limits=UsageLimits(request_limit=10),
        )
    except (UsageLimitExceeded, UnexpectedModelBehavior):
        payload_limite: dict[str, Any] = {
            "resposta": "Não consegui chegar a uma resposta confiável para essa pergunta. Tente reformular ou ser mais específico.",
            "sql": None,
            "tabelas": [],
            "dados": {"colunas": [], "linhas": []},
            "status": "nao_sei",
            "gerado_em": datetime.now(timezone.utc),
            "metadados": {
                "dados_ficticios": False,
                "gold_atualizada_em": gold_atualizada_em,
                "observacoes": ["O agente atingiu o limite de chamadas ao modelo sem concluir."],
            },
            "apresentacao": "texto",
        }
        if conversa_id is not None:
            payload_limite["conversa_id"] = conversa_id
        return payload_limite
    etapas_ms["agente_ms"] = int((time.perf_counter() - t_agente) * 1000)

    t_val = time.perf_counter()
    saida: RespostaAgente = resultado_run.output

    if deps.bloqueio:
        saida = saida.model_copy(
            update={
                "status": "bloqueado",
                "sql": None,
                "texto": f"Consulta bloqueada pelas regras de segurança: {deps.bloqueio}",
            }
        )

    sql_final = deps.ultimo_sql or saida.sql
    if saida.status == "ok" and sql_final != saida.sql:
        saida = saida.model_copy(update={"sql": sql_final})

    ultimo_res = deps.ultimo_resultado
    apresentacao = decidir_modo_apresentacao(saida.status, ultimo_res)
    texto_renderizado = substituir_marcadores_pt_br(saida.texto, saida.marcadores)
    periodo_plano = saida.plano.periodo if saida.plano else None
    texto_renderizado = complementar_texto_para_tabela(
        texto_renderizado,
        apresentacao,
        ultimo_res,
        periodo=periodo_plano,
    )

    observacoes = enriquecer_avisos_e_premissas(saida, sql_final, ultimo_res)
    saida = saida.model_copy(update={"premissas": observacoes})
    etapas_ms["validacao_ms"] = int((time.perf_counter() - t_val) * 1000)

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

    latencia_total_ms = int((time.perf_counter() - inicio_total) * 1000)

    telemetria = construir_telemetria(
        resultado_run=resultado_run,
        deps=deps,
        saida=saida,
        modelo_nome=obter_nome_modelo("sql"),
        provedor_nome=obter_provedor_configurado(),
        latencia_total_ms=latencia_total_ms,
        etapas_ms=etapas_ms,
        numeros_conferidos=(saida.status == "ok" and deps.tentativas_validacao_saida <= 1),
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
            "gold_atualizada_em": gold_atualizada_em,
            "observacoes": observacoes,
        },
        "apresentacao": apresentacao,
        "detalhes_tecnicos": detalhes,
    }
    if conversa_id is not None:
        payload["conversa_id"] = conversa_id
    return payload


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
    gold_atualizada_em: datetime | str | None = None,
    modo_schema: ModoSchema | None = None,
    usar_cache: bool | None = None,
    usar_self_consistency: bool | None = None,
) -> dict[str, Any]:
    """Função principal do agente do Théo: recebe a pergunta e devolve o dicionário compatível com RespostaIA."""
    inicio_total = time.perf_counter()
    etapas_ms: dict[str, int] = {}

    tem_historico = bool(historico)
    if usar_cache is not None:
        cache_habilitado = usar_cache
    elif modelo is not None or executar_sql_fn is not None:
        # Quando um modelo ou executor customizado é injetado (ex.: FunctionModel em testes),
        # só usa cache se usar_cache=True for passado explicitamente.
        cache_habilitado = False
    else:
        cache_habilitado = os.getenv("AI_CACHE_ENABLED", "1").strip() != "0"

    # 1. Cache de respostas repetidas (GENAI-24) — apenas para perguntas sem histórico
    if cache_habilitado and not tem_historico:
        em_cache = buscar_resposta_em_cache(
            pergunta,
            gold_atualizada_em=gold_atualizada_em,
            tem_historico=False,
        )
        if em_cache is not None:
            if conversa_id is not None:
                em_cache["conversa_id"] = conversa_id
            return em_cache

    # 2. Seleção de schema por skills — SS do CHESS (GENAI-23)
    t_ss = time.perf_counter()
    consumo_neg_explicito = detectar_pedido_consumo_negativo_explicito(pergunta)
    skills_selecionadas, contexto_skills = montar_contexto_schema(
        pergunta,
        skills_forcadas=skills_ativas,
        modo=modo_schema,
    )
    msgs_historico = converter_historico_para_mensagens(historico)
    etapas_ms["ss_ms"] = int((time.perf_counter() - t_ss) * 1000)

    # 3. Candidate Generator (CG do CHESS — GENAI-9, 10, 13, 14, 17)
    resposta_inicial = _executar_uma_vez(
        pergunta,
        msgs_historico=msgs_historico,
        skills_selecionadas=skills_selecionadas,
        contexto_skills=contexto_skills,
        consumo_neg_explicito=consumo_neg_explicito,
        entidades_resolvidas=entidades_resolvidas or {},
        modelo=modelo,
        executar_sql_fn=executar_sql_fn,
        valores_distintos_fn=valores_distintos_fn,
        descrever_tabela_fn=descrever_tabela_fn,
        gold_atualizada_em=gold_atualizada_em,
        conversa_id=conversa_id,
        etapas_base_ms=etapas_ms,
        inicio_total=inicio_total,
    )

    # 4. Self-consistency seletiva — CHASE-SQL simplificado (GENAI-31, desligado por padrão)
    sc_habilitado = (
        usar_self_consistency
        if usar_self_consistency is not None
        else (os.getenv("AI_SELF_CONSISTENCY", "0").strip() == "1")
    )
    resposta_final = resposta_inicial
    if sc_habilitado and precisa_disparar_self_consistency(resposta_inicial):
        resposta_final = executar_votacao_chase_sql(
            resposta_inicial,
            lambda _idx: _executar_uma_vez(
                pergunta,
                msgs_historico=msgs_historico,
                skills_selecionadas=skills_selecionadas,
                contexto_skills=contexto_skills,
                consumo_neg_explicito=consumo_neg_explicito,
                entidades_resolvidas=entidades_resolvidas or {},
                modelo=modelo,
                executar_sql_fn=executar_sql_fn,
                valores_distintos_fn=valores_distintos_fn,
                descrever_tabela_fn=descrever_tabela_fn,
                gold_atualizada_em=gold_atualizada_em,
                conversa_id=conversa_id,
                etapas_base_ms=etapas_ms,
                inicio_total=inicio_total,
            ),
            n_extras=2,
        )

    # 5. Salvar no cache quando `ok` e sem histórico (GENAI-24)
    if cache_habilitado and not tem_historico and resposta_final.get("status") == "ok":
        salvar_resposta_em_cache(
            pergunta,
            resposta_final,
            gold_atualizada_em=gold_atualizada_em,
            tem_historico=False,
        )

    return resposta_final
