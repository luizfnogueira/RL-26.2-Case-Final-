"""Comparação de recortes: os KPIs do /dashboard para cada item, lado a lado e por UC."""
from decimal import Decimal

from sqlalchemy.orm import Session

from app.repositories.gold_metadata import metadados_gold
from app.schemas.common import duracao
from app.schemas.dashboard import FiltrosComparacao, FiltrosDashboard
from app.services.dashboard_service import kpi, montar_indicadores


def filtros_do_item(filtros: FiltrosComparacao, nome: str) -> FiltrosDashboard:
    """O item vira o filtro do seu nível, mantendo os filtros pai (ex.: bairro dentro do município)."""
    regiao = {'municipio': filtros.municipio, 'bairro': filtros.bairro, filtros.nivel: nome}
    return FiltrosDashboard(periodo_atual=filtros.periodo_atual,
                            periodo_comparacao=filtros.periodo_comparacao, **regiao)


def por_uc_mes(total: Decimal | None, ucs: int | None, meses: int) -> Decimal | None:
    # Denominador: UCs ativas no fim da janela, como o KPI do painel. Sem UC, a média não existe.
    if total is None or not ucs:
        return None
    return round(Decimal(total) / ucs / meses, 2)


def montar_item(indicadores: dict, nome: str, filtros: FiltrosComparacao) -> dict:
    pa, pc = filtros.periodo_atual, filtros.periodo_comparacao
    meses = duracao(pa)
    ucs, receita, energia = (indicadores[k] for k in ('ucs_ativas', 'receita_faturada', 'energia_faturada'))
    inadimplencia = indicadores['inadimplencia']

    def media(kpi_total: dict, rotulo: str, unidade: str) -> dict:
        return kpi(rotulo,
                   por_uc_mes(kpi_total['atual']['valor'], ucs['atual']['valor'], meses),
                   por_uc_mes(kpi_total['comparacao']['valor'], ucs['comparacao']['valor'], meses),
                   unidade, pa, pc)

    valor_em_aberto_pct = kpi('Valor em aberto (% da receita)',
                              inadimplencia['percentual_receita_atual']['valor'],
                              inadimplencia['percentual_receita_comparacao']['valor'], '%', pa, pc)
    # A diferença entre dois percentuais é em pontos percentuais, já calculada no painel.
    valor_em_aberto_pct['diferenca'] = inadimplencia['variacao_pontos_percentuais']
    return {
        'nome': nome,
        'ucs_ativas': ucs,
        'receita_media_uc': media(receita, 'Receita por UC', 'BRL/UC/mes'),
        'consumo_medio_uc': media(energia, 'Consumo por UC', 'kWh/UC/mes'),
        'valor_em_aberto_pct': valor_em_aberto_pct,
        'dec': indicadores['dec_medio'],
        'fec': indicadores['fec_medio'],
    }


def montar_comparacao(db: Session, filtros: FiltrosComparacao) -> dict:
    metadados = metadados_gold(db, 'fato_uc_mes', 'Dados fictícios do seed, com as regras da Gold.')
    itens = []
    for nome in filtros.itens:
        indicadores = montar_indicadores(db, filtros_do_item(filtros, nome))
        if not indicadores['ucs_ativas']['atual']['valor'] and not indicadores['ucs_ativas']['comparacao']['valor']:
            # Item fora do cadastro: os indicadores vêm vazios, e a comparação dos outros continua.
            metadados['observacoes'].append(f'{nome}: nenhuma UC neste recorte; indicadores ausentes.')
        itens.append(montar_item(indicadores, nome, filtros))
    if filtros.nivel != 'municipio':
        metadados['observacoes'].append('DEC e FEC só existem por município: ausentes para bairro e classe.')
    return {
        'filtros': filtros.model_dump(exclude={'classe', 'alimentador'}),
        'itens': itens,
        'metadados': metadados,
    }
