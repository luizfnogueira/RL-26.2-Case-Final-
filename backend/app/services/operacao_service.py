"""Rankings e séries sobre o grão alimentador × mês da Gold."""
from collections import defaultdict
from decimal import Decimal
from sqlalchemy.orm import Session

from app.core.config import GOLD_SOURCE
from app.repositories import operacao_repository as repo
from app.repositories.gold_metadata import metadados_gold
from app.services.stubs import indicador, paginar
from app.schemas.operacao import FiltrosOperacao

UNIDADES = {'dec': 'h/UC', 'fec': 'interrupcoes/UC', 'dec_sem_dia_critico': 'h/UC',
            'fec_sem_dia_critico': 'interrupcoes/UC', 'interrupcoes': 'interrupcoes',
            'horas_interrupcao': 'h'}
INDICES = ('dec', 'fec', 'dec_sem_dia_critico', 'fec_sem_dia_critico')


def soma(valores):
    valores = list(valores)
    # Uma célula ausente não se transforma em zero ou num total parcial.
    return sum(valores, Decimal(0)) if valores and all(v is not None for v in valores) else None


def metricas(linhas, periodo, regional=False):
    resultado = {n: soma(r[n] for r in linhas) for n in ('interrupcoes', 'horas_interrupcao')}
    if not regional:
        resultado.update({n: soma(r[n] for r in linhas) for n in INDICES})
    else:
        meses = defaultdict(list)
        for r in linhas:
            meses[r['mes_referencia']].append(r)
        for n in INDICES:
            parcelas = []
            for grupo in meses.values():
                cc = soma(r['ucs_atendidas'] for r in grupo)
                # DEC/FEC regional é calculado por mês com o Cc daquele mês,
                # nunca com a média ou o Cc final da janela.
                # Usa os índices publicados pela Gold. CHI está arredondado a
                # 2 casas: reconstruir DEC a partir dele perderia precisão.
                numerador = soma(None if r[n] is None or r['ucs_atendidas'] is None
                                 else r[n] * r['ucs_atendidas'] for r in grupo)
                parcelas.append(numerador / cc if cc and numerador is not None else None)
            resultado[n] = soma(parcelas)
    return {n: indicador(None if v is None else round(v, 4), UNIDADES[n], periodo)
            for n, v in resultado.items()}


def ordenar(linhas, campo, chave):
    campo = 'horas_interrupcao' if campo == 'chi' else campo
    linhas.sort(key=lambda r: (r[campo]['valor'] is None,
                              -(r[campo]['valor'] or 0), chave(r)))
    for i, r in enumerate(linhas, 1):
        r['posicao'] = i
    return linhas


def montar_operacao(db: Session, filtros: FiltrosOperacao) -> dict:
    linhas = repo.consultar_meses(db, filtros)
    grupos = defaultdict(list)
    for r in linhas:
        grupos[r['alimentador']].append(r)
    bairros = repo.consultar_bairros(db, list(grupos))
    series, ranking = [], []
    regionais = defaultdict(list)
    for a, meses in grupos.items():
        municipio = meses[0]['municipio']
        atendidos = bairros.get(a, [])
        series.append({'alimentador': a, 'pontos': [
            {'mes': r['mes_referencia'], **{n: indicador(r[n], UNIDADES[n], r['mes_referencia'])
                                          for n in INDICES}} for r in meses]})
        ranking.append({'alimentador': a, 'municipio': municipio,
                        'bairros_atendidos': atendidos,
                        'ucs_atendidas': meses[-1]['ucs_atendidas'],
                        **metricas(meses, filtros.periodo_atual)})
        destinos = [None] if filtros.nivel_regional == 'municipio' else [
            b for b in atendidos if filtros.bairro in (None, b)]
        for b in destinos:
            regionais[(municipio, b)].extend(meses)
    regional = [{'municipio': m, 'bairro': b, **metricas(rs, filtros.periodo_atual, regional=True)}
                for (m, b), rs in regionais.items()]
    metadata = metadados_gold(db, 'agg_dec_fec_mensal', 'Continuidade fictícia do seed.')
    metadata['observacoes'].append(
        'Bairro seleciona os alimentadores que o atendem, mantendo o Cc mensal completo. '
        'Bairros com alimentadores compartilhados não são somáveis. UCs atendidas: último mês disponível. '
        'Indicadores regionais ponderam os índices mensais publicados pela Gold pelo Cc do mesmo mês.')
    if GOLD_SOURCE == 'seed':
        metadata['observacoes'].append('O seed não possui expurgo de dias críticos: esses índices são ausentes.')
    return {
        'filtros': filtros.model_dump(exclude={'page', 'page_size', 'nivel_regional'}),
        'serie_historica': series,
        'ranking_alimentadores': paginar(ordenar(ranking, filtros.ordenar_por, lambda r: r['alimentador']), filtros),
        'ranking_regional': {'nivel_regional': filtros.nivel_regional, **paginar(
            ordenar(regional, filtros.ordenar_por, lambda r: (r['municipio'], r['bairro'] or '')), filtros)},
        'metadados': metadata,
    }
