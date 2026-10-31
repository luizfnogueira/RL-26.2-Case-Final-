"""Dashboard simulado: recortes fictícios distribuem o consolidado; não é a implementação B3b."""
from app.core.exceptions import CenarioStubIndisponivelException
from app.schemas.dashboard import FiltrosDashboard
from app.services.stubs import (
    CAMPOS_REGIAO, PERIODO_ATUAL as PA, PERIODO_COMPARACAO as PC,
    exemplo, filtrar_regiao, indicador, paginar, verificar_cenario,
)

CAMPOS = ('receita_atual', 'receita_comparacao', 'energia_atual', 'energia_comparacao',
          'ucs_ativas_atual', 'ucs_ativas_comparacao', 'inadimplencia_atual', 'inadimplencia_comparacao')
# Parcela de energia da receita no stub (tributos fictícios de 28%); a Gold traz receita_energia pronta.
FATOR_ENERGIA = 1 / 1.28
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


def _decompor(recortes: list[dict]) -> dict:
    """Preço × volume como gold.agg_preco_volume: por recorte, depois somado.

    efeito_volume = (kWh atual − kWh comparação) × tarifa de comparação;
    efeito_preco = Δ receita de energia − efeito_volume (fecha sem resíduo).
    """
    atual = comparacao = volume = 0.0
    for r in recortes:
        receita_atual, receita_comparacao = r['receita_atual'] * FATOR_ENERGIA, r['receita_comparacao'] * FATOR_ENERGIA
        volume += (r['energia_atual'] - r['energia_comparacao']) * receita_comparacao / r['energia_comparacao']
        atual += receita_atual
        comparacao += receita_comparacao
    atual, comparacao, volume = round(atual, 2), round(comparacao, 2), round(volume, 2)
    return {'atual': atual, 'comparacao': comparacao, 'volume': volume,
            'preco': round(atual - comparacao - volume, 2)}


def _indicadores(soma: dict, base: dict, filtrado: bool) -> dict:
    pct_atual = round(soma['inadimplencia_atual'] / soma['receita_atual'] * 100, 4)
    pct_comparacao = round(soma['inadimplencia_comparacao'] / soma['receita_comparacao'] * 100, 4)
    continuidade = {}
    for nome in ('dec_medio', 'fec_medio'):
        kpi = base[nome]
        kpi.pop('meta', None)   # sem meta: o contrato não tem mais esse campo
        if filtrado:
            for campo in ('atual', 'comparacao', 'diferenca', 'variacao_percentual'):
                kpi[campo]['valor'] = None
        continuidade[nome] = kpi
    return {
        'receita_faturada': _kpi('Receita faturada (com tributos)', soma['receita_atual'], soma['receita_comparacao'],
                                 'BRL'),
        'energia_faturada': _kpi('Volume faturado', soma['energia_atual'], soma['energia_comparacao'], 'kWh'),
        'ucs_ativas': _kpi('UCs ativas', soma['ucs_ativas_atual'], soma['ucs_ativas_comparacao'], 'UCs'),
        'inadimplencia': {
            **_kpi('Valor em aberto', soma['inadimplencia_atual'], soma['inadimplencia_comparacao'], 'BRL'),
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


def _ponte(recortes: list[dict]) -> dict:
    d, soma = _decompor(recortes), _somar(recortes)
    tarifa_atual = d['atual'] / soma['energia_atual']
    tarifa_comparacao = d['comparacao'] / soma['energia_comparacao']
    return {
        'receita_energia_comparacao': indicador(d['comparacao'], 'BRL', PC),
        'efeito_preco': indicador(d['preco'], 'BRL', PA),
        'efeito_volume': indicador(d['volume'], 'BRL', PA),
        'receita_energia_atual': indicador(d['atual'], 'BRL', PA),
        'reajuste_percentual': indicador(_variacao(tarifa_atual, tarifa_comparacao), '%', PA),
    }


def _drill(filtros: FiltrosDashboard, recortes: list[dict]) -> dict:
    nivel = filtros.nivel
    grupos: dict[str, list[dict]] = {}
    for recorte in recortes:
        grupos.setdefault(recorte[nivel], []).append(recorte)
    linhas = []
    for nome, grupo in grupos.items():
        soma, d = _somar(grupo), _decompor(grupo)
        # Filtros para reenviar com o próximo nível: os atuais mais o valor desta linha.
        linha_filtros = {campo: getattr(filtros, campo) for campo in ('municipio', 'bairro', 'classe')}
        linha_filtros[nivel] = nome
        linhas.append({
            'nivel': nivel,
            'nome': nome,
            'receita_energia_atual': indicador(d['atual'], 'BRL', PA),
            'receita_energia_comparacao': indicador(d['comparacao'], 'BRL', PC),
            'energia_atual': indicador(soma['energia_atual'], 'kWh', PA),
            'energia_comparacao': indicador(soma['energia_comparacao'], 'kWh', PC),
            'variacao_energia_percentual': indicador(
                _variacao(soma['energia_atual'], soma['energia_comparacao']), '%', PA),
            'queda_kwh': indicador(soma['energia_comparacao'] - soma['energia_atual'], 'kWh', PA),
            'efeito_preco': indicador(d['preco'], 'BRL', PA),
            'efeito_volume': indicador(d['volume'], 'BRL', PA),
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
        'ponte_receita': _ponte(selecionados),
        'drill_down': _drill(filtros, selecionados),
        'metadados': metadados,
    }
