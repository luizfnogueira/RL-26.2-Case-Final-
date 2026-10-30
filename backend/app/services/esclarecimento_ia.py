"""Pedir esclarecimento (contrato, seção 9): pergunta ambígua volta com opções, sem chamar o modelo.

Dois casos, detectados por código e sem gastar tokens:
- bairro que existe em mais de um município, sem o município na pergunta (a troca anterior só vale numa
  continuação "E no Centro?" depois de uma pergunta com um município só)
  ("Centro" existe em 10 municípios da Gold; somá-los daria um número sem sentido);
- "este ano" sem ano nem período: a base termina em jun/2026, então 2026 tem só 6 meses e P2 é
  jul/2025 a jun/2026.
Cada opção leva a pergunta já completa: o clique reenvia na mesma conversa e o agente responde direto.
"""
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any

# O Centro existe em 10 municípios da Gold: todos viram botão (mais o "Todos")
MAX_OPCOES = 10
TODOS = "somando todos os municípios"
_MINUSCULAS = {"de", "da", "do", "das", "dos", "e"}
_ESTE_ANO = re.compile(r"\b(?:(n|d)?(?:este|esse)\s+ano|(no|do)\s+ano\s+atual)\b", re.IGNORECASE)
_ANO_OU_PERIODO = re.compile(r"\b(20\d{2}|p[12])\b", re.IGNORECASE)
# Continuação curta da troca anterior: "E no Centro?", "e o centro"
_CONTINUACAO = re.compile(r"^E\b")


def normalizar(texto: str) -> str:
    sem_acento = "".join(c for c in unicodedata.normalize("NFKD", texto or "") if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sem_acento.upper()).strip()


def nome_legivel(nome: str) -> str:
    """"JABOATAO DOS GUARARAPES" → "Jaboatao dos Guararapes" (como o formatarNome do front)."""
    palavras = nome.lower().split()
    return " ".join(p if i and p in _MINUSCULAS else p[:1].upper() + p[1:] for i, p in enumerate(palavras))


def _menciona(texto_normalizado: str, nome: str) -> bool:
    return re.search(rf"(?<![A-Z0-9]){re.escape(normalizar(nome))}(?![A-Z0-9])", texto_normalizado) is not None


def _bairro_ambiguo(pergunta: str, historico: list[dict], ambiguos: dict[str, set[str]],
                    municipios: set[str]) -> dict | None:
    texto = normalizar(pergunta)
    if normalizar(TODOS) in texto:
        return None
    anterior = normalizar((historico[-1].get("pergunta_interpretada") or "") if historico else "")
    # Bairro mais longo primeiro: "BOA VIAGEM" antes de um "VIAGEM" que exista sozinho
    for bairro in sorted(ambiguos, key=len, reverse=True):
        if not _menciona(texto, bairro):
            continue
        do_bairro = ambiguos[bairro]
        # Qualquer município citado resolve, mesmo um sem esse bairro: aí o agente responde que não há dados
        if any(_menciona(texto, m) for m in do_bairro | municipios):
            return None
        # A troca anterior só resolve em "E no Centro?" logo depois de uma pergunta com um município só;
        # "Municípios fora Recife…" seguido de "Receita do Centro" pergunta de novo
        citados_antes = {m for m in do_bairro | municipios if _menciona(anterior, m)}
        if _CONTINUACAO.match(texto) and len(citados_antes) == 1:
            return None
        base = pergunta.strip().rstrip("?").strip()
        legivel = nome_legivel(bairro)
        opcoes = [{"rotulo": f"{legivel} de {nome_legivel(m)}",
                   "pergunta": f"{base} (bairro {legivel}, em {nome_legivel(m)})?"}
                  for m in sorted(do_bairro)[:MAX_OPCOES]]
        opcoes.append({"rotulo": "Todos os municípios juntos", "pergunta": f"{base} (bairro {legivel}, {TODOS})?"})
        return {
            "pergunta": f"O bairro {legivel} existe em {len(do_bairro)} municípios. De qual você quer saber?",
            "opcoes": opcoes,
        }
    return None


def _este_ano(pergunta: str) -> dict | None:
    if not _ESTE_ANO.search(pergunta) or _ANO_OU_PERIODO.search(pergunta):
        return None

    def trocar(por: str):
        def substituir(m: re.Match) -> str:
            preposicao = "de" if (m.group(1) or m.group(2) or "").lower() in ("d", "do") else "em"
            return f"{preposicao} {por}"
        return _ESTE_ANO.sub(substituir, pergunta.strip(), count=1)

    return {
        "pergunta": "Os dados vão até junho de 2026. \"Este ano\" é 2026 (janeiro a junho) ou o P2 (jul/2025 a jun/2026)?",
        "opcoes": [
            {"rotulo": "2026 (jan a jun)", "pergunta": trocar("2026 (janeiro a junho)")},
            {"rotulo": "P2 (jul/2025 a jun/2026)", "pergunta": trocar("P2 (jul/2025 a jun/2026)")},
        ],
    }


def detectar(pergunta: str, historico: list[dict], ambiguos: dict[str, set[str]],
             municipios: set[str] = frozenset()) -> dict | None:
    """O pedido de esclarecimento (pergunta e opções) ou None quando a pergunta já é clara."""
    return _bairro_ambiguo(pergunta, historico, ambiguos, set(municipios)) or _este_ano(pergunta)


def resposta(esclarecimento: dict, gold_atualizada_em: Any) -> dict:
    """RespostaIA com status `esclarecer`; sem SQL nem dados, porque nada foi consultado."""
    return {
        "resposta": esclarecimento["pergunta"], "sql": None, "tabelas": [],
        "dados": {"colunas": [], "linhas": []}, "status": "esclarecer",
        "gerado_em": datetime.now(timezone.utc).isoformat(), "apresentacao": "texto",
        "metadados": {"dados_ficticios": False, "gold_atualizada_em": gold_atualizada_em, "observacoes": []},
        "esclarecimento": esclarecimento,
    }
