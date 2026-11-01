"""Cache em memória de respostas repetidas, invalidado pela versão da Gold (GENAI-24).

Economiza chamadas e protege a demonstração contra o limite de requisições da API gratuita:
- Chave = `(pergunta_normalizada, versao_gold)`
- Ativo apenas para perguntas sem histórico de conversa (`not historico`).
- Invalida automaticamente quando `gold_atualizada_em` muda.
- Marca `detalhes_tecnicos.tokens_tempo.cache = True` e `origem = "resposta do cache"`.
"""

from __future__ import annotations

import copy
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any

_CACHE_RESPOSTAS: dict[tuple[str, str], dict[str, Any]] = {}
_ULTIMA_VERSAO_GOLD: str | None = None


def normalizar_chave_pergunta(pergunta: str) -> str:
    """Normaliza a pergunta para que variações de caixa, acento ou espaços batam na mesma chave."""
    if not pergunta:
        return ""
    sem_acento = "".join(
        ch for ch in unicodedata.normalize("NFKD", pergunta.strip()) if not unicodedata.combining(ch)
    )
    limpo = re.sub(r"\s+", " ", sem_acento.lower()).rstrip("?!.")
    return limpo.strip()


def _normalizar_versao_gold(gold_atualizada_em: datetime | str | None) -> str:
    if gold_atualizada_em is None:
        return "sem_versao"
    if isinstance(gold_atualizada_em, datetime):
        return gold_atualizada_em.isoformat()
    return str(gold_atualizada_em).strip() or "sem_versao"


def limpar_cache_respostas() -> None:
    """Limpa todo o cache de respostas em memória."""
    global _ULTIMA_VERSAO_GOLD
    _CACHE_RESPOSTAS.clear()
    _ULTIMA_VERSAO_GOLD = None


def buscar_resposta_em_cache(
    pergunta: str,
    *,
    gold_atualizada_em: datetime | str | None = None,
    tem_historico: bool = False,
) -> dict[str, Any] | None:
    """Retorna cópia da resposta em cache (com indicação nos detalhes técnicos) ou None."""
    global _ULTIMA_VERSAO_GOLD
    if tem_historico:
        return None

    versao_str = _normalizar_versao_gold(gold_atualizada_em)
    if _ULTIMA_VERSAO_GOLD is not None and _ULTIMA_VERSAO_GOLD != versao_str:
        # GENAI-24.3: Invalidar quando a Gold for recarregada
        _CACHE_RESPOSTAS.clear()
    _ULTIMA_VERSAO_GOLD = versao_str

    chave = (normalizar_chave_pergunta(pergunta), versao_str)
    item = _CACHE_RESPOSTAS.get(chave)
    if item is None:
        return None

    copia = copy.deepcopy(item)
    copia["gerado_em"] = datetime.now(timezone.utc)
    detalhes = copia.setdefault("detalhes_tecnicos", {})
    tokens_tempo = detalhes.setdefault("tokens_tempo", {})
    tokens_tempo["cache"] = True
    tokens_tempo["origem"] = "resposta do cache"
    tokens_tempo["chamadas"] = 0
    tokens_tempo["latencia_total_ms"] = 0
    return copia


def salvar_resposta_em_cache(
    pergunta: str,
    resposta: dict[str, Any],
    *,
    gold_atualizada_em: datetime | str | None = None,
    tem_historico: bool = False,
) -> None:
    """Armazena no cache apenas respostas bem-sucedidas (`status == 'ok'`) e sem histórico."""
    global _ULTIMA_VERSAO_GOLD
    if tem_historico or resposta.get("status") != "ok":
        return

    versao_str = _normalizar_versao_gold(gold_atualizada_em)
    if _ULTIMA_VERSAO_GOLD is not None and _ULTIMA_VERSAO_GOLD != versao_str:
        _CACHE_RESPOSTAS.clear()
    _ULTIMA_VERSAO_GOLD = versao_str

    chave = (normalizar_chave_pergunta(pergunta), versao_str)
    _CACHE_RESPOSTAS[chave] = copy.deepcopy(resposta)
