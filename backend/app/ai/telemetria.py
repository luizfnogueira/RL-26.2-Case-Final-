"""Extração de telemetria e detalhes técnicos a partir do run do PydanticAI (GENAI-17)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.ai.contratos import AcaoFerramenta, DepsAgente, RespostaAgente, TelemetriaExecucao
from app.ai.modelo import extrair_uso_run

AVALIACAO_ULTIMA_PATH = Path(__file__).resolve().parent / "avaliacao_ultima.json"


def _resumir_retorno_ferramenta(conteudo: Any, limite: int = 240) -> str:
    """Gera um resumo curto e seguro do retorno de uma tool para o painel de detalhes técnicos."""
    if conteudo is None:
        return "Sem retorno"
    if isinstance(conteudo, str):
        texto = conteudo.strip()
    else:
        try:
            texto = json.dumps(conteudo, ensure_ascii=False, default=str)
        except Exception:
            texto = str(conteudo)
    if len(texto) > limite:
        return texto[: limite - 3] + "..."
    return texto


def extrair_acoes_do_run(resultado_run: Any) -> list[AcaoFerramenta]:
    """Extrai a sequência 'pensamento -> ação -> observação' de result.all_messages()."""
    obter_msgs = getattr(resultado_run, "all_messages", None)
    if not callable(obter_msgs):
        return []

    mensagens = obter_msgs()
    chamadas_por_id: dict[str, AcaoFerramenta] = {}
    acoes: list[AcaoFerramenta] = []
    ordem = 0

    for msg in mensagens:
        partes = getattr(msg, "parts", None) or []
        for parte in partes:
            kind = getattr(parte, "part_kind", "")
            if kind == "tool-call":
                ordem += 1
                tool_name = getattr(parte, "tool_name", "ferramenta")
                raw_args = getattr(parte, "args", {})
                if isinstance(raw_args, str):
                    try:
                        args_dict = json.loads(raw_args)
                    except Exception:
                        args_dict = {"raw": raw_args}
                elif isinstance(raw_args, dict):
                    args_dict = raw_args
                else:
                    args_dict = {"valor": str(raw_args)}

                acao = AcaoFerramenta(
                    ordem=ordem,
                    ferramenta=tool_name,
                    argumentos=args_dict,
                    resumo_retorno="Executada",
                    sucesso=True,
                )
                acoes.append(acao)
                call_id = getattr(parte, "tool_call_id", None)
                if call_id:
                    chamadas_por_id[str(call_id)] = acao

            elif kind == "tool-return":
                call_id = getattr(parte, "tool_call_id", None)
                conteudo = getattr(parte, "content", None)
                resumo = _resumir_retorno_ferramenta(conteudo)
                if call_id and str(call_id) in chamadas_por_id:
                    chamadas_por_id[str(call_id)].resumo_retorno = resumo
                elif acoes:
                    acoes[-1].resumo_retorno = resumo

            elif kind == "retry-prompt":
                call_id = getattr(parte, "tool_call_id", None)
                conteudo = getattr(parte, "content", None)
                resumo_erro = f"ModelRetry: {_resumir_retorno_ferramenta(conteudo)}"
                if call_id and str(call_id) in chamadas_por_id:
                    chamadas_por_id[str(call_id)].sucesso = False
                    chamadas_por_id[str(call_id)].resumo_retorno = resumo_erro
                elif acoes:
                    acoes[-1].sucesso = False
                    acoes[-1].resumo_retorno = resumo_erro

    return acoes


def carregar_resumo_avaliacao() -> dict[str, Any] | None:
    """Lê avaliacao_ultima.json se existir para compor o bloco de qualidade do painel (GENAI-19)."""
    if not AVALIACAO_ULTIMA_PATH.exists():
        return None
    try:
        return json.loads(AVALIACAO_ULTIMA_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def construir_telemetria(
    *,
    resultado_run: Any | None,
    deps: DepsAgente,
    saida: RespostaAgente,
    modelo_nome: str,
    provedor_nome: str,
    latencia_total_ms: int,
    etapas_ms: dict[str, int],
    numeros_conferidos: bool = True,
    consumo_negativo_filtrado: bool = True,
    cache_hit: bool = False,
) -> TelemetriaExecucao:
    """Empacota tokens, chamadas, etapas e verificações num único objeto TelemetriaExecucao."""
    tokens_in = 0
    tokens_out = 0
    tokens_reasoning = 0
    requests_count = 0
    acoes: list[AcaoFerramenta] = []

    if resultado_run is not None:
        uso = extrair_uso_run(resultado_run)
        if uso is not None:
            tokens_in = int(getattr(uso, "input_tokens", 0) or 0)
            tokens_out = int(getattr(uso, "output_tokens", 0) or 0)
            tokens_reasoning = int(getattr(uso, "output_reasoning_tokens", 0) or 0)
            requests_count = int(getattr(uso, "requests", 0) or 0)
        acoes = extrair_acoes_do_run(resultado_run)

    sql_validado = deps.bloqueio is None and (saida.sql is not None or saida.status != "ok")
    verificacoes = {
        "sql_validado": sql_validado,
        "numeros_conferidos": numeros_conferidos,
        "consumo_negativo_filtrado": consumo_negativo_filtrado,
        "confianca": saida.confianca,
    }

    return TelemetriaExecucao(
        modelo=modelo_nome,
        provedor=provedor_nome,
        tokens_entrada=tokens_in,
        tokens_saida=tokens_out,
        tokens_raciocinio=tokens_reasoning,
        chamadas_modelo=requests_count,
        tentativas_sql=deps.tentativas_sql,
        latencia_total_ms=latencia_total_ms,
        etapas_ms=etapas_ms,
        cache_hit=cache_hit,
        skills_utilizadas=list(deps.skills_ativas),
        acoes=acoes,
        verificacoes=verificacoes,
    )


def montar_detalhes_tecnicos(
    saida: RespostaAgente,
    telemetria: TelemetriaExecucao,
    n_linhas: int = 0,
) -> dict[str, Any]:
    """Formata o dicionário `detalhes_tecnicos` conforme a Seção 9 do Planning da Sprint."""
    return {
        "estrutura_pensamento": {
            "pergunta_interpretada": saida.pergunta_interpretada,
            "plano": saida.plano.model_dump() if saida.plano else None,
            "skills": telemetria.skills_utilizadas,
            "premissas": saida.premissas,
            "justificativa": saida.justificativa,
        },
        "acoes": [acao.model_dump() for acao in telemetria.acoes],
        "consulta": {
            "sql_executado": saida.sql,
            "tentativas": telemetria.tentativas_sql,
            "linhas": n_linhas,
        },
        "tokens_tempo": {
            "tokens_entrada": telemetria.tokens_entrada,
            "tokens_saida": telemetria.tokens_saida,
            "tokens_raciocinio": telemetria.tokens_raciocinio,
            "chamadas": telemetria.chamadas_modelo,
            "latencia_total_ms": telemetria.latencia_total_ms,
            "etapas_ms": telemetria.etapas_ms,
            "modelo": telemetria.modelo,
            "provedor": telemetria.provedor,
            "cache": telemetria.cache_hit,
        },
        "verificacoes": telemetria.verificacoes,
        "avaliacao": carregar_resumo_avaliacao(),
    }


def construir_detalhes_tecnicos_guia(
    *,
    pergunta: str,
    status: str,
    secoes_enviadas_ids: list[str],
    secoes_usadas_ids: list[str],
    resultado_run: Any | None,
    modelo_nome: str,
    provedor_nome: str,
    latencia_total_ms: int,
    etapas_ms: dict[str, int],
    resposta_validada: bool = True,
    justificativa: str | None = None,
) -> dict[str, Any]:
    """Empacota tokens, latência e verificações do agente do guia no contrato de DetalhesTecnicos (T5)."""
    tokens_in = 0
    tokens_out = 0
    tokens_reasoning = 0
    requests_count = 0
    acoes: list[AcaoFerramenta] = []

    if resultado_run is not None:
        uso = extrair_uso_run(resultado_run)
        if uso is not None:
            tokens_in = int(getattr(uso, "input_tokens", 0) or 0)
            tokens_out = int(getattr(uso, "output_tokens", 0) or 0)
            tokens_reasoning = int(getattr(uso, "output_reasoning_tokens", 0) or 0)
            requests_count = int(getattr(uso, "requests", 0) or 0)
        acoes = extrair_acoes_do_run(resultado_run)

    premissas = [
        "Resposta elaborada exclusivamente a partir do Guia da Plataforma (sem acesso ao banco de dados).",
    ]
    if secoes_enviadas_ids:
        premissas.append(f"Seções consultadas no guia: {', '.join(secoes_enviadas_ids)}.")
    if secoes_usadas_ids:
        premissas.append(f"Seções citadas na resposta: {', '.join(secoes_usadas_ids)}.")

    return {
        "estrutura_pensamento": {
            "pergunta_interpretada": pergunta,
            "plano": None,
            "skills": ["guia_plataforma"],
            "premissas": premissas,
            "justificativa": justificativa,
        },
        "acoes": [acao.model_dump() for acao in acoes],
        "consulta": {
            "sql_executado": None,
            "tentativas": 0,
            "linhas": 0,
        },
        "tokens_tempo": {
            "tokens_entrada": tokens_in,
            "tokens_saida": tokens_out,
            "tokens_raciocinio": tokens_reasoning,
            "chamadas": requests_count,
            "latencia_total_ms": latencia_total_ms,
            "etapas_ms": etapas_ms,
            "modelo": modelo_nome,
            "provedor": provedor_nome,
            "cache": False,
        },
        "verificacoes": {
            "sql_validado": None,
            "numeros_conferidos": resposta_validada,
            "consumo_negativo_filtrado": True,
            "confianca": 1.0 if status == "ok" and resposta_validada else None,
        },
        "avaliacao": carregar_resumo_avaliacao(),
    }

