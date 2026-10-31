from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import Contexto, Indicador, Mes, Metadados, Pagina, Paginacao, Periodo, Schema, Texto

NivelDrill = Literal['municipio', 'bairro', 'classe']
MIN_ITENS, MAX_ITENS = 2, 4


class FiltrosDashboard(Contexto, Paginacao):
    periodo_comparacao: Periodo
    nivel: NivelDrill = 'municipio'

    @model_validator(mode='after')
    def validar_nivel(self):
        # Bairro sem município misturaria bairros homônimos ("Centro" existe em vários municípios).
        # Classe não exige pais: sem bairro, é o ranking de classes do município ou de toda a área.
        if self.nivel == 'bairro' and not self.municipio:
            raise ValueError('nivel bairro exige municipio')
        return self


class Kpi(Schema):
    rotulo: str
    atual: Indicador
    comparacao: Indicador
    diferenca: Indicador
    variacao_percentual: Indicador


class KpiInadimplencia(Kpi):
    percentual_receita_atual: Indicador
    percentual_receita_comparacao: Indicador
    variacao_pontos_percentuais: Indicador


class IndicadoresDashboard(Schema):
    receita_faturada: Kpi
    energia_faturada: Kpi
    ucs_ativas: Kpi
    inadimplencia: KpiInadimplencia
    dec_medio: Kpi
    fec_medio: Kpi


class PontoSerie(Schema):
    mes: Mes
    receita: Indicador
    energia: Indicador


class PonteReceita(Schema):
    """Decomposição da receita de energia (sem tributos), como em gold.agg_preco_volume."""
    receita_energia_comparacao: Indicador
    efeito_preco: Indicador
    efeito_volume: Indicador
    receita_energia_atual: Indicador
    reajuste_percentual: Indicador


class FiltrosLinha(Schema):
    municipio: str | None
    bairro: str | None
    classe: str | None


class ItemBreadcrumb(Schema):
    nivel: Literal['consolidado', 'municipio', 'bairro']
    rotulo: str
    filtros: FiltrosLinha


class LinhaDrill(Schema):
    nivel: NivelDrill
    nome: str
    receita_energia_atual: Indicador
    receita_energia_comparacao: Indicador
    energia_atual: Indicador
    energia_comparacao: Indicador
    variacao_energia_percentual: Indicador
    queda_kwh: Indicador
    efeito_preco: Indicador
    efeito_volume: Indicador
    filtros: FiltrosLinha


class DrillDown(Pagina[LinhaDrill]):
    nivel: NivelDrill
    breadcrumb: list[ItemBreadcrumb]


class Dashboard(Schema):
    filtros: Contexto
    indicadores: IndicadoresDashboard
    serie_historica: list[PontoSerie]
    ponte_receita: PonteReceita
    drill_down: DrillDown
    metadados: Metadados


class FiltrosComparacao(Contexto):
    """2 a 4 recortes do mesmo nível; municipio e bairro são os filtros "pai" dos itens."""
    periodo_comparacao: Periodo
    nivel: NivelDrill
    itens: list[Texto] = Field(min_length=MIN_ITENS, max_length=MAX_ITENS)

    @model_validator(mode='after')
    def validar_recorte(self):
        if len(set(self.itens)) != len(self.itens):
            raise ValueError('itens repetidos')
        if self.classe is not None or self.alimentador is not None:
            raise ValueError('a comparação aceita só municipio e bairro como filtros pai')
        if self.nivel == 'municipio' and (self.municipio or self.bairro):
            raise ValueError('nivel municipio não aceita filtro pai')
        if self.nivel == 'bairro' and (not self.municipio or self.bairro):
            raise ValueError('nivel bairro exige municipio, sem bairro')
        return self


class ItemComparacao(Schema):
    nome: str
    ucs_ativas: Kpi
    receita_media_uc: Kpi
    consumo_medio_uc: Kpi
    valor_em_aberto_pct: Kpi
    dec: Kpi
    fec: Kpi


class Comparacao(Schema):
    filtros: FiltrosComparacao
    itens: list[ItemComparacao]
    metadados: Metadados
