"""DEC/FEC simulados a partir de operacao.json; rankings recalculados sobre os alimentadores filtrados."""
from app.core.exceptions import CenarioStubIndisponivelException
from app.schemas.operacao import FiltrosOperacao
from app.services.stubs import PERIODO_ATUAL, exemplo, indicador, paginar, verificar_cenario

UNIDADES = {'dec': 'h/UC', 'fec': 'interrupcoes/UC', 'interrupcoes': 'interrupcoes'}


def _ranking(items: list[dict], ordenar_por: str, nome) -> list[dict]:
    items.sort(key=lambda item: (-item[ordenar_por]['valor'], nome(item)))
    for posicao, item in enumerate(items, start=1):
        item['posicao'] = posicao
    return items


def _regional(alimentadores: list[dict], filtros: FiltrosOperacao) -> list[dict]:
    """Média de DEC/FEC ponderada pelas UCs de cada alimentador; o denominador não é recalculado por bairro."""
    grupos: dict[tuple[str, str | None], list[dict]] = {}
    for alimentador in alimentadores:
        if filtros.nivel_regional == 'municipio':
            grupos.setdefault((alimentador['municipio'], None), []).append(alimentador)
            continue
        for bairro in alimentador['bairros_atendidos']:
            if filtros.bairro in (None, bairro):
                grupos.setdefault((alimentador['municipio'], bairro), []).append(alimentador)
    linhas = []
    for (municipio, bairro), grupo in grupos.items():
        ucs = sum(a['ucs_atendidas'] for a in grupo)
        linha = {'posicao': 0, 'municipio': municipio, 'bairro': bairro}
        for nome in ('dec', 'fec'):
            media = sum(a[nome]['valor'] * a['ucs_atendidas'] for a in grupo) / ucs
            linha[nome] = indicador(round(media, 2), UNIDADES[nome], PERIODO_ATUAL)
        linha['interrupcoes'] = indicador(
            sum(a['interrupcoes']['valor'] for a in grupo), UNIDADES['interrupcoes'], PERIODO_ATUAL)
        linhas.append(linha)
    return linhas


def montar_operacao(filtros: FiltrosOperacao) -> dict:
    verificar_cenario(filtros.periodo_atual)
    if filtros.classe is not None:
        raise CenarioStubIndisponivelException('O filtro classe não está disponível no mock operacional.')
    base = exemplo('operacao')
    alimentadores = [
        a for a in base['ranking_alimentadores']['items']
        if filtros.alimentador in (None, a['alimentador'])
        and filtros.municipio in (None, a['municipio'])
        and (filtros.bairro is None or filtros.bairro in a['bairros_atendidos'])
    ]
    if not alimentadores:
        raise CenarioStubIndisponivelException('Nenhum alimentador fictício corresponde aos filtros informados.')
    nomes = {a['alimentador'] for a in alimentadores}
    regional = _ranking(_regional(alimentadores, filtros), filtros.ordenar_por,
                        lambda linha: (linha['municipio'], linha['bairro'] or ''))
    return {
        'filtros': filtros.model_dump(exclude={'page', 'page_size', 'nivel_regional'}),
        'serie_historica': [s for s in base['serie_historica'] if s['alimentador'] in nomes],
        'ranking_alimentadores': paginar(
            _ranking(alimentadores, filtros.ordenar_por, lambda a: a['alimentador']), filtros),
        'ranking_regional': {'nivel_regional': filtros.nivel_regional, **paginar(regional, filtros)},
        'metadados': base['metadados'],
    }
