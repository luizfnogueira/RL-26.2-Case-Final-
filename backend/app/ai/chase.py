"""Self-consistency seletiva (CHASE-SQL simplificado — GENAI-31).

Inspirado na Parte 5 do workshop de Text-to-SQL:
- Só entra em ação quando habilitado (`usar_self_consistency=True` ou `AI_SELF_CONSISTENCY=1`)
  E a 1ª execução terminar com `confianca == 'baixa'` ou resultado vazio.
- Dispara 2 candidatos extras e agrupa as respostas pelos resultados da execução no banco.
- Se houver maioria (pelo menos 2 candidatos com o mesmo resultado de execução), a maioria vence.
- Se os candidatos discordarem (sem maioria), devolve `status='nao_sei'` explicando que
  diferentes interpretações geraram números distintos (nunca chuta).
"""

from __future__ import annotations

import json
from collections import Counter
from typing import Any, Callable


def assinatura_resultado_execucao(resposta: dict[str, Any]) -> str | None:
    """Gera uma assinatura canônica determinística das linhas de dados retornadas pela execução SQL."""
    if resposta.get("status") != "ok":
        return None
    dados = resposta.get("dados") or {}
    linhas = dados.get("linhas") or []
    if not linhas:
        return None

    linhas_normalizadas: list[str] = []
    for linha in sorted((json.dumps(row, sort_keys=True, default=str) for row in linhas)):
        linhas_normalizadas.append(linha)
    return "|".join(linhas_normalizadas)


def precisa_disparar_self_consistency(resposta_inicial: dict[str, Any]) -> bool:
    """Retorna True somente quando a confiança veio baixa ou o resultado veio vazio (GENAI-31.1)."""
    if resposta_inicial.get("status") == "bloqueado":
        return False

    detalhes = resposta_inicial.get("detalhes_tecnicos") or {}
    verificacoes = detalhes.get("verificacoes") or {}
    confianca = verificacoes.get("confianca", "alta")
    dados = resposta_inicial.get("dados") or {}
    linhas = dados.get("linhas") or []

    if confianca == "baixa":
        return True
    if not linhas:
        return True
    return False


def executar_votacao_chase_sql(
    resposta_inicial: dict[str, Any],
    gerar_candidato_fn: Callable[[int], dict[str, Any]],
    n_extras: int = 2,
) -> dict[str, Any]:
    """Dispara `n_extras` candidatos adicionais e escolhe por maioria nos resultados de execução (GENAI-31.2, 31.3)."""
    candidatos: list[dict[str, Any]] = [resposta_inicial]
    for indice in range(1, n_extras + 1):
        candidatos.append(gerar_candidato_fn(indice))

    assinaturas: list[str | None] = [assinatura_resultado_execucao(c) for c in candidatos]
    validas = [ass for ass in assinaturas if ass is not None]

    # Se nenhum candidato obteve resultado válido
    if not validas:
        base = dict(resposta_inicial)
        base["status"] = "nao_sei"
        base["sql"] = None
        base["tabelas"] = []
        base["dados"] = {"colunas": [], "linhas": []}
        base["apresentacao"] = "texto"
        return base

    contagem = Counter(validas)
    assinatura_mais_comum, votos = contagem.most_common(1)[0]

    # Maioria vence: pelo menos 2 candidatos concordam no mesmo resultado de execução
    if votos >= 2:
        for cand, ass in zip(candidatos, assinaturas):
            if ass == assinatura_mais_comum:
                vencedor = dict(cand)
                detalhes = vencedor.setdefault("detalhes_tecnicos", {})
                verificacoes = detalhes.setdefault("verificacoes", {})
                verificacoes["self_consistency_votos"] = f"{votos}/{len(candidatos)}"
                return vencedor

    # GENAI-31.3: Sem maioria -> nao_sei explicando que as interpretações deram números diferentes
    divergente = dict(resposta_inicial)
    divergente["status"] = "nao_sei"
    divergente["sql"] = None
    divergente["tabelas"] = []
    divergente["dados"] = {"colunas": [], "linhas": []}
    divergente["apresentacao"] = "texto"
    divergente["resposta"] = (
        "Não foi possível responder com segurança: diferentes interpretações da consulta "
        "produziram números divergentes nos dados. Por favor, especifique o período, "
        "a métrica ou o recorte desejado."
    )
    detalhes = divergente.setdefault("detalhes_tecnicos", {})
    verificacoes = detalhes.setdefault("verificacoes", {})
    verificacoes["self_consistency_votos"] = f"divergente ({len(contagem)} resultados distintos em {len(candidatos)} candidatos)"
    return divergente
