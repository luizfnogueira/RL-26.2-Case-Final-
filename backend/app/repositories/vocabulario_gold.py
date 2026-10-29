"""Nomes de município, bairro e classe da Gold, por versão da carga, para o esclarecimento e o cache do assistente.

A lista só muda quando a Gold é recarregada: uma consulta por versão, guardada em memória.
Sem banco ou com o banco fora do ar, volta vazia (e não fica guardada).
"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

_POR_VERSAO: dict[str, dict[str, Any]] = {}
VAZIO = {"municipios": set(), "bairros": set(), "classes": set(), "bairros_ambiguos": {}}


def nomes(db, versao_gold: Any) -> dict[str, Any]:
    chave = str(versao_gold)
    if chave in _POR_VERSAO:
        return _POR_VERSAO[chave]
    if db is None:
        return VAZIO
    from app.models.gold_source import UnidadeConsumidora as UC
    try:
        linhas = db.execute(select(UC.municipio, UC.bairro, UC.classe).distinct()).all()
    except SQLAlchemyError:
        return VAZIO
    por_bairro: dict[str, set[str]] = {}
    for municipio, bairro, _ in linhas:
        if bairro and municipio:
            por_bairro.setdefault(bairro, set()).add(municipio)
    _POR_VERSAO.clear()
    _POR_VERSAO[chave] = {
        "municipios": {m for m, _, _ in linhas if m},
        "bairros": set(por_bairro),
        "classes": {c for _, _, c in linhas if c},
        "bairros_ambiguos": {b: m for b, m in por_bairro.items() if len(m) > 1},
    }
    return _POR_VERSAO[chave]
