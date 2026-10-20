from app.schemas.common import Disponibilidade, FiltrosDashboard, Indicador, Mes, Schema


class Comparacao(Schema):
    atual: Indicador
    comparacao: Indicador
    variacao_percentual: Indicador


class IndicadoresDashboard(Schema):
    receita_faturada: Comparacao
    consumo: Comparacao


class PrecoVolume(Schema):
    periodo_atual: Mes
    periodo_comparacao: Mes
    status: Disponibilidade
    motivo_indisponibilidade: str | None
    efeito_preco: Indicador
    efeito_volume: Indicador


class Dashboard(Schema):
    filtros: FiltrosDashboard
    indicadores: IndicadoresDashboard
    analise_preco_volume: PrecoVolume
