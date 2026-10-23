from typing import Literal

from pydantic import model_validator

from app.schemas.common import Contexto, Indicador, Mes, Metadados, Pagina, Paginacao, Periodo, Schema

NivelDrill = Literal['municipio', 'bairro', 'classe']


class FiltrosDashboard(Contexto, Paginacao):
    periodo_comparacao: Periodo
    nivel: NivelDrill = 'municipio'

    @model_validator(mode='after')
    def validar_nivel(self):
        if self.nivel == 'bairro' and not self.municipio:
            raise ValueError('nivel bairro exige municipio')
        if self.nivel == 'classe' and not (self.municipio and self.bairro):
            raise ValueError('nivel classe exige municipio e bairro')
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


class KpiContinuidade(Kpi):
    meta: Indicador


class IndicadoresDashboard(Schema):
    receita_faturada: Kpi
    energia_faturada: Kpi
    ucs_ativas: Kpi
    inadimplencia: KpiInadimplencia
    dec_medio: KpiContinuidade
    fec_medio: KpiContinuidade


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
