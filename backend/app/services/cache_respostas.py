"""Respostas pré-calculadas: o cache se enche conforme as pessoas perguntam e economiza tokens.

Uma resposta `ok` de pergunta sem histórico fica em ia.resposta_cache, por versão da Gold. Uma pergunta
nova igual ou muito parecida reaproveita a resposta, sem chamar o modelo. "Parecida" tem duas condições:
- o texto, sem acento, pontuação e palavras vazias, tem semelhança de 90% ou mais;
- a assinatura é idêntica: nomes da Gold (município, bairro, classe), números, P1/P2, meses e palavras
  que mudam a resposta (maior/menor, média/total, gráfico…). "Receita comercial em Jaboatão" e "em
  Olinda" têm textos 90% iguais e assinaturas diferentes: não se confundem.
Recarregar a Gold muda a versão e esvazia o cache.
"""
import copy
import json
import re
import unicodedata
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.exc import SQLAlchemyError

from app.models.ia import RespostaCache
from app.repositories.interacao_repository import mascarar

SEMELHANCA_MINIMA = 0.9
MAX_RESPOSTAS = 500
OBSERVACAO = "Resposta reaproveitada da pergunta “{pergunta}”, com a mesma versão da Gold, sem chamar o modelo."

_VAZIAS = set("""a o as os um uma uns umas de da do das dos em na no nas nos ao aos e ou que qual quais quanto
quanta quantos quantas como foi foram e é sao ser esta estao para por com sobre me mostre mostra diga fale
informe pode poderia voce por favor ai entao agora isso essa esse""".split())
# Palavras que mudam a resposta mesmo num texto quase igual
_QUALIFICADORES = set("""maior maiores menor menores mais menos media medio medios medias total soma minimo
maximo crescimento cresceu queda caiu aumento aumentou reducao diminuiu primeiro primeira ultimo ultima top
grafico barras pizza linhas mensal mes ano""".split())
_MESES = set("janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro".split())


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c)).lower()


def _palavras(pergunta: str) -> list[str]:
    # "p1"/"p2" ficam inteiros; senão viravam "p" e "1"
    return re.findall(r"\bp[12]\b|[a-z]+|\d+(?:[.,]\d+)?", _sem_acento(pergunta))


def chave(pergunta: str) -> str:
    """Texto comparável: sem acento, pontuação, caixa e palavras vazias."""
    return " ".join(p for p in _palavras(pergunta) if p not in _VAZIAS)


def assinatura(pergunta: str, nomes: dict[str, Any]) -> str:
    """O que precisa ser idêntico para reaproveitar: nomes da Gold, números, períodos e qualificadores."""
    texto = f" {' '.join(_palavras(pergunta))} "
    partes = {p for p in texto.split() if p in _QUALIFICADORES or p in _MESES or p.isdigit()
              or re.fullmatch(r"\d+[.,]\d+|p[12]", p)}
    for grupo in ("municipios", "bairros", "classes"):
        for nome in nomes.get(grupo, ()):
            normalizado = " ".join(_palavras(nome))
            if normalizado and f" {normalizado} " in texto:
                partes.add(f"{grupo}:{normalizado}")
    return "|".join(sorted(partes))


def semelhanca(a: str, b: str) -> float:
    """O maior entre a semelhança do texto e a das palavras (a ordem das palavras não importa)."""
    palavras_a, palavras_b = set(a.split()), set(b.split())
    jaccard = len(palavras_a & palavras_b) / len(palavras_a | palavras_b) if palavras_a | palavras_b else 1.0
    return max(SequenceMatcher(None, a, b).ratio(), jaccard)


def buscar(db, pergunta: str, versao_gold: Any, nomes: dict[str, Any]) -> dict | None:
    """A resposta guardada mais parecida (marcada como reaproveitada) ou None."""
    if db is None:
        return None
    alvo = chave(pergunta)
    try:
        candidatas = db.scalars(select(RespostaCache).where(
            RespostaCache.versao_gold == str(versao_gold), RespostaCache.assinatura == assinatura(pergunta, nomes))).all()
        melhor = max(candidatas, key=lambda c: semelhanca(alvo, c.chave), default=None)
        if melhor is None or semelhanca(alvo, melhor.chave) < SEMELHANCA_MINIMA:
            return None
        db.execute(update(RespostaCache).where(RespostaCache.id == melhor.id)
                   .values(acertos=RespostaCache.acertos + 1, usado_em=_agora()))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        return None
    return _marcar_como_reaproveitada(copy.deepcopy(melhor.resposta), melhor.pergunta)


def guardar(db, pergunta: str, versao_gold: Any, nomes: dict[str, Any], resposta: dict) -> None:
    """Guarda uma resposta `ok` (sem gráfico: ele depende das palavras da pergunta de quem pede)."""
    if db is None or resposta.get("status") != "ok":
        return
    bruta = {k: v for k, v in copy.deepcopy(resposta).items() if k not in ("grafico", "conversa_id")}
    if bruta.get("apresentacao") == "grafico":
        bruta["apresentacao"] = "tabela"
    versao, texto = str(versao_gold), chave(pergunta)
    try:
        # Outra versão da Gold: tudo o que estava guardado ficou velho
        db.execute(delete(RespostaCache).where(RespostaCache.versao_gold != versao))
        db.execute(delete(RespostaCache).where(RespostaCache.versao_gold == versao, RespostaCache.chave == texto))
        db.add(RespostaCache(versao_gold=versao, chave=texto, assinatura=assinatura(pergunta, nomes),
                             pergunta=mascarar(pergunta), resposta=_json(bruta)))
        excedentes = select(RespostaCache.id).order_by(RespostaCache.usado_em.desc()).offset(MAX_RESPOSTAS)
        db.execute(delete(RespostaCache).where(RespostaCache.id.in_(excedentes)))
        db.commit()
    except SQLAlchemyError:
        db.rollback()


def _marcar_como_reaproveitada(resposta: dict, pergunta_original: str) -> dict:
    tokens = ((resposta.get("detalhes_tecnicos") or {}).get("tokens_tempo"))
    if tokens is not None:
        tokens.update(cache=True, tokens_entrada=0, tokens_saida=0, tokens_raciocinio=0, chamadas=0,
                      latencia_total_ms=0, etapas_ms={})
    resposta.setdefault("metadados", {}).setdefault("observacoes", []).append(
        OBSERVACAO.format(pergunta=pergunta_original))
    return resposta


def _json(resposta: dict) -> dict:
    """JSONB guarda só tipos de JSON: datas viram texto ISO."""
    return json.loads(json.dumps(resposta, default=lambda v: v.isoformat() if hasattr(v, "isoformat") else str(v)))


def _agora():
    return datetime.now(timezone.utc)
