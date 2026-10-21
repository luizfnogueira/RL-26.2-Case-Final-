from typing import Literal

from app.schemas.common import FiltrosRegiao, Indicador, Mes, Metadados, Pagina, Paginacao, Periodo, Schema

NivelRegional = Literal['municipio', 'bairro']


class FiltrosOperacao(FiltrosRegiao, Paginacao):
    periodo_atual: Periodo
    ordenar_por: Literal['dec', 'fec'] = 'dec'
    nivel_regional: NivelRegional = 'municipio'


class PontoOperacao(Schema):
    mes: Mes
    dec: Indicador
    fec: Indicador


class SerieAlimentador(Schema):
    alimentador: str
    pontos: list[PontoOperacao]


class RankingAlimentador(Schema):
    posicao: int
    alimentador: str
    municipio: str
    bairros_atendidos: list[str]
    ucs_atendidas: int
    dec: Indicador
    fec: Indicador
    interrupcoes: Indicador


class RankingRegional(Schema):
    posicao: int
    municipio: str
    bairro: str | None
    dec: Indicador
    fec: Indicador
    interrupcoes: Indicador


class RankingAlimentadores(Pagina[RankingAlimentador]):
    pass


class RankingRegionalPagina(Pagina[RankingRegional]):
    nivel_regional: NivelRegional


class FiltrosOperacaoAplicados(FiltrosRegiao):
    periodo_atual: Periodo
    ordenar_por: Literal['dec', 'fec']


class Operacao(Schema):
    filtros: FiltrosOperacaoAplicados
    serie_historica: list[SerieAlimentador]
    ranking_alimentadores: RankingAlimentadores
    ranking_regional: RankingRegionalPagina
    metadados: Metadados
