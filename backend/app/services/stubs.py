"""Exemplos locais do P1 (contrato V2); sem acesso ao banco ou agente e sem persistência."""
import json
from pathlib import Path

from app.core.exceptions import CenarioStubIndisponivelException
from app.schemas.common import limites

FIXTURES = Path(__file__).resolve().parent / 'fixtures'

# Únicas janelas com números simulados; outros intervalos válidos retornam 422.
PERIODO_ATUAL = '2025-07/2026-06'
PERIODO_COMPARACAO = '2022-07/2023-06'
CAMPOS_REGIAO = ('municipio', 'bairro', 'classe', 'alimentador')


def exemplo(nome: str) -> dict:
    # Cada chamada recebe um objeto independente, sem mutar exemplos compartilhados.
    return json.loads((FIXTURES / f'{nome}.json').read_text(encoding='utf-8'))


def verificar_cenario(periodo_atual: str | None, periodo_comparacao: str | None = None) -> None:
    if periodo_atual not in (None, PERIODO_ATUAL) or periodo_comparacao not in (None, PERIODO_COMPARACAO):
        raise CenarioStubIndisponivelException(
            f'O stub só simula periodo_atual={PERIODO_ATUAL} e periodo_comparacao={PERIODO_COMPARACAO}.')


def indicador(valor: float | None, unidade: str, periodo: str) -> dict:
    return {'valor': valor, 'unidade': unidade, 'periodo_referencia': periodo}


def no_periodo(mes: str, periodo: str) -> bool:
    inicio, fim = limites(periodo)
    return inicio <= mes <= fim


def filtrar_regiao(items: list[dict], filtros, cadastro: dict[str, dict] | None = None) -> list[dict]:
    """Filtros geográficos por AND; `cadastro` completa a região de itens que só têm id_uc."""
    def campo(item: dict, nome: str):
        return item[nome] if nome in item else (cadastro or {}).get(item['id_uc'], {}).get(nome)
    return [item for item in items if all(
        getattr(filtros, nome, None) is None or campo(item, nome) == getattr(filtros, nome)
        for nome in CAMPOS_REGIAO
    )]


def paginar(items: list, filtros) -> dict:
    inicio = (filtros.page - 1) * filtros.page_size
    return {'items': items[inicio:inicio + filtros.page_size],
            'page': filtros.page, 'page_size': filtros.page_size, 'total': len(items)}


def cadastro() -> dict[str, dict]:
    return {uc['id_uc']: uc for uc in exemplo('unidades')['items']}
