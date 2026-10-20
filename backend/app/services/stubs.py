"""Exemplos locais do P1; sem acesso ao banco ou agente e sem persistência."""
import json
from pathlib import Path

from fastapi import HTTPException

FIXTURES = Path(__file__).resolve().parent / 'fixtures'


def exemplo(nome: str) -> dict:
    # Cada chamada recebe um objeto independente, sem mutar exemplos compartilhados.
    return json.loads((FIXTURES / f'{nome}.json').read_text(encoding='utf-8'))


def paginar(payload: dict, filtros, cadastro: dict | None = None) -> dict:
    items = payload['items']
    for campo in ('municipio', 'bairro', 'classe', 'alimentador', 'id_uc', 'status'):
        valor = getattr(filtros, campo, None)
        if valor is not None:
            items = [item for item in items if item.get(campo, (cadastro or {}).get(campo)) == valor]
    busca = getattr(filtros, 'busca', None)
    if busca:
        items = [item for item in items if any(
            busca.casefold() in item.get(campo, '').casefold()
            for campo in ('id_uc', 'nome_titular')
        )]
    periodo = getattr(filtros, 'periodo_atual', None)
    if periodo:
        items = [item for item in items if (
            item['criado_em'][:7] if 'criado_em' in item else payload.get('periodo_referencia')
        ) == periodo]
    inicio = (filtros.page - 1) * filtros.page_size
    return {**payload, 'items': items[inicio:inicio + filtros.page_size],
            'page': filtros.page, 'page_size': filtros.page_size, 'total': len(items)}


def verificar_id(valor: str, esperado: str, codigo: str, mensagem: str) -> None:
    if valor != esperado:
        raise HTTPException(status_code=404, detail={'codigo': codigo, 'mensagem': mensagem})
