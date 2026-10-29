from typing import Literal
from pydantic import model_validator

from app.schemas.common import FiltrosRegiao, Indicador, Mes, Metadados, Pagina, Paginacao, Periodo, Schema

NivelRegional = Literal['municipio', 'bairro']
# chi = horas de interrupção (consumidor-hora interrompido), ranking de onde mais gente ficou sem energia
OrdenarPor = Literal['dec', 'fec', 'chi']


class FiltrosOperacao(FiltrosRegiao, Paginacao):
    periodo_atual: Periodo
    ordenar_por: OrdenarPor = 'dec'
    nivel_regional: NivelRegional = 'municipio'

    @model_validator(mode='after')
    def rejeitar_classe(self):
        if self.classe is not None:
            raise ValueError('Operação é agregada por alimentador; filtro classe indisponível.')
        return self


class PontoOperacao(Schema):
    mes: Mes
    dec: Indicador
    fec: Indicador
    dec_sem_dia_critico: Indicador
    fec_sem_dia_critico: Indicador


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
    dec_sem_dia_critico: Indicador
    fec_sem_dia_critico: Indicador
    interrupcoes: Indicador
    horas_interrupcao: Indicador


class RankingRegional(Schema):
    posicao: int
    municipio: str
    bairro: str | None
    dec: Indicador
    fec: Indicador
    dec_sem_dia_critico: Indicador
    fec_sem_dia_critico: Indicador
    interrupcoes: Indicador
    horas_interrupcao: Indicador


class RankingAlimentadores(Pagina[RankingAlimentador]):
    pass


class RankingRegionalPagina(Pagina[RankingRegional]):
    nivel_regional: NivelRegional


class FiltrosOperacaoAplicados(FiltrosRegiao):
    periodo_atual: Periodo
    ordenar_por: OrdenarPor


class Operacao(Schema):
    filtros: FiltrosOperacaoAplicados
    serie_historica: list[SerieAlimentador]
    ranking_alimentadores: RankingAlimentadores
    ranking_regional: RankingRegionalPagina
    metadados: Metadados
