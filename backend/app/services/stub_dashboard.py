"""Dashboard simulado: recortes fictícios distribuem o consolidado; não é a implementação B3b."""
from app.core.exceptions import CenarioStubIndisponivelException
from app.schemas.dashboard import FiltrosDashboard
from app.services.stubs import (
    CAMPOS_REGIAO, PERIODO_ATUAL as PA, PERIODO_COMPARACAO as PC,
    exemplo, filtrar_regiao, indicador, paginar, verificar_cenario,
)

CAMPOS = ('receita_atual', 'receita_comparacao', 'energia_atual', 'energia_comparacao',
          'ucs_ativas_atual', 'ucs_ativas_comparacao', 'inadimplencia_atual', 'inadimplencia_comparacao')
ROTULO_RECORTE = 'Distribuição ilustrativa do consolidado; não representa metodologia nem diagnóstico real.'
SEM_DEC_FEC = 'DEC/FEC por recorte não estão disponíveis no dashboard simulado; consulte GET /operacao.'


def _somar(recortes: list[dict]) -> dict:
    return {campo: sum(r[campo] for r in recortes) for campo in CAMPOS}


def _variacao(atual: float, comparacao: float) -> float | None:
    return round((atual - comparacao) / comparacao * 100, 4) if comparacao else None


def _kpi(rotulo: str, atual: float, comparacao: float, unidade: str) -> dict:
    return {
        'rotulo': rotulo,
        'atual': indicador(atual, unidade, PA),
        'comparacao': indicador(comparacao, unidade, PC),
        'diferenca': indicador(round(atual - comparacao, 2), unidade, PA),
        'variacao_percentual': indicador(_variacao(atual, comparacao), '%', PA),
    }


def _efeitos(soma: dict, total: dict, ponte: dict) -> tuple[float, float]:
    """Efeito-preço proporcional à receita atual; efeito-volume proporcional à variação de energia."""
    preco = round(ponte['efeito_preco']['valor'] * soma['receita_atual'] / total['receita_atual'], 2)
    volume = round(ponte['efeito_volume']['valor']
                   * (soma['energia_atual'] - soma['energia_comparacao'])
                   / (total['energia_atual'] - total['energia_comparacao']), 2)
    return preco, volume


def _indicadores(soma: dict, base: dict, filtrado: bool) -> dict:
    pct_atual = round(soma['inadimplencia_atual'] / soma['receita_atual'] * 100, 4)
    pct_comparacao = round(soma['inadimplencia_comparacao'] / soma['receita_comparacao'] * 100, 4)
    continuidade = {}
    for nome in ('dec_medio', 'fec_medio'):
        kpi = base[nome]
        if filtrado:
            for campo in ('atual', 'comparacao', 'diferenca', 'variacao_percentual'):
                kpi[campo]['valor'] = None
        continuidade[nome] = kpi
    return {
        'receita_faturada': _kpi('Receita faturada', soma['receita_atual'], soma['receita_comparacao'], 'BRL'),
        'energia_faturada': _kpi('Volume faturado', soma['energia_atual'], soma['energia_comparacao'], 'kWh'),
        'ucs_ativas': _kpi('UCs ativas', soma['ucs_ativas_atual'], soma['ucs_ativas_comparacao'], 'UCs'),
        'inadimplencia': {
            **_kpi('Inadimplência', soma['inadimplencia_atual'], soma['inadimplencia_comparacao'], 'BRL'),
            'percentual_receita_atual': indicador(pct_atual, '%', PA),
            'percentual_receita_comparacao': indicador(pct_comparacao, '%', PC),
            'variacao_pontos_percentuais': indicador(round(pct_atual - pct_comparacao, 4), 'p.p.', PA),
        },
        **continuidade,
    }


def _serie(serie: list[dict], soma: dict, total: dict) -> list[dict]:
    # Fatores por ano: 1º ano = participação na comparação, 4º = participação atual.
    for i, ponto in enumerate(serie):
        ano = i // 12
        for nome in ('receita', 'energia'):
            inicio = soma[f'{nome}_comparacao'] / total[f'{nome}_comparacao']
            fim = soma[f'{nome}_atual'] / total[f'{nome}_atual']
            ponto[nome]['valor'] = round(ponto[nome]['valor'] * (inicio + (fim - inicio) * ano / 3), 2)
    return serie


def _ponte(soma: dict, total: dict, ponte: dict) -> dict:
    preco, volume = _efeitos(soma, total, ponte)
    atual, comparacao = soma['receita_atual'], soma['receita_comparacao']
    return {
        'receita_comparacao': indicador(comparacao, 'BRL', PC),
        'efeito_preco': indicador(preco, 'BRL', PA),
        'efeito_volume': indicador(volume, 'BRL', PA),
        # Resíduo: garante receita_comparacao + efeitos = receita_atual em qualquer recorte.
        'bandeira_mix': indicador(round(atual - comparacao - preco - volume, 2), 'BRL', PA),
        'receita_atual': indicador(atual, 'BRL', PA),
        'reajuste_percentual': ponte['reajuste_percentual'],
    }


def _drill(filtros: FiltrosDashboard, recortes: list[dict], total: dict, ponte: dict) -> dict:
    nivel = filtros.nivel
    grupos: dict[str, list[dict]] = {}
    for recorte in recortes:
        grupos.setdefault(recorte[nivel], []).append(recorte)
    linhas = []
    for nome, grupo in grupos.items():
        soma = _somar(grupo)
        preco, volume = _efeitos(soma, total, ponte)
        # Filtros para reenviar com o próximo nível: os atuais mais o valor desta linha.
        linha_filtros = {campo: getattr(filtros, campo) for campo in ('municipio', 'bairro', 'classe')}
        linha_filtros[nivel] = nome
        linhas.append({
            'nivel': nivel,
            'nome': nome,
            'receita_atual': indicador(soma['receita_atual'], 'BRL', PA),
            'receita_comparacao': indicador(soma['receita_comparacao'], 'BRL', PC),
            'energia_atual': indicador(soma['energia_atual'], 'kWh', PA),
            'energia_comparacao': indicador(soma['energia_comparacao'], 'kWh', PC),
            'variacao_energia_percentual': indicador(
                _variacao(soma['energia_atual'], soma['energia_comparacao']), '%', PA),
            'queda_kwh': indicador(soma['energia_comparacao'] - soma['energia_atual'], 'kWh', PA),
            'efeito_preco': indicador(preco, 'BRL', PA),
            'efeito_volume': indicador(volume, 'BRL', PA),
            'filtros': linha_filtros,
        })
    linhas.sort(key=lambda linha: (-linha['queda_kwh']['valor'], linha['nome']))

    vazio = {'municipio': None, 'bairro': None, 'classe': None}
    breadcrumb = [{'nivel': 'consolidado', 'rotulo': 'Todos os municípios', 'filtros': vazio}]
    if nivel in ('bairro', 'classe'):
        breadcrumb.append({'nivel': 'municipio', 'rotulo': filtros.municipio,
                           'filtros': {**vazio, 'municipio': filtros.municipio}})
    if nivel == 'classe':
        breadcrumb.append({'nivel': 'bairro', 'rotulo': filtros.bairro,
                           'filtros': {**vazio, 'municipio': filtros.municipio, 'bairro': filtros.bairro}})
    return {'nivel': nivel, 'breadcrumb': breadcrumb, **paginar(linhas, filtros)}


def montar_dashboard(filtros: FiltrosDashboard) -> dict:
    verificar_cenario(filtros.periodo_atual, filtros.periodo_comparacao)
    base = exemplo('dashboard')
    recortes = exemplo('dashboard_recortes')['recortes']
    selecionados = filtrar_regiao(recortes, filtros)
    if not selecionados:
        raise CenarioStubIndisponivelException('Nenhum recorte fictício corresponde aos filtros informados.')
    total, soma = _somar(recortes), _somar(selecionados)
    filtrado = len(selecionados) < len(recortes)
    metadados = base['metadados']
    if filtrado:
        metadados['observacoes'] += [ROTULO_RECORTE, SEM_DEC_FEC]
    return {
        'filtros': filtros.model_dump(include={'periodo_atual', 'periodo_comparacao', *CAMPOS_REGIAO}),
        'indicadores': _indicadores(soma, base['indicadores'], filtrado),
        'serie_historica': _serie(base['serie_historica'], soma, total) if filtrado else base['serie_historica'],
        'ponte_receita': _ponte(soma, total, base['ponte_receita']),
        'drill_down': _drill(filtros, selecionados, total, base['ponte_receita']),
        'metadados': metadados,
    }
