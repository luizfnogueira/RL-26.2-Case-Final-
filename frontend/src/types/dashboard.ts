import type {
  Contexto,
  FiltrosRegiao,
  Indicador,
  Mes,
  Metadados,
  Pagina,
  ParamsPaginacao,
  Periodo,
} from './comum'

export type NivelDrill = 'municipio' | 'bairro' | 'classe'

/** Query de GET /dashboard. Os dois períodos são obrigatórios e têm a mesma duração. */
export interface ParamsDashboard extends FiltrosRegiao, ParamsPaginacao {
  periodo_atual: Periodo
  periodo_comparacao: Periodo
  /** Padrão `municipio`. `bairro` exige município; `classe` exige município e bairro. */
  nivel?: NivelDrill
}

export interface Kpi {
  rotulo: string
  atual: Indicador
  comparacao: Indicador
  diferenca: Indicador
  variacao_percentual: Indicador
}

export interface KpiInadimplencia extends Kpi {
  percentual_receita_atual: Indicador
  percentual_receita_comparacao: Indicador
  variacao_pontos_percentuais: Indicador
}

/** DEC e FEC. A meta é ilustrativa, não um limite regulatório. */
export interface KpiContinuidade extends Kpi {
  meta: Indicador
}

export interface IndicadoresDashboard {
  receita_faturada: Kpi
  energia_faturada: Kpi
  ucs_ativas: Kpi
  inadimplencia: KpiInadimplencia
  dec_medio: KpiContinuidade
  fec_medio: KpiContinuidade
}

/** Um dos 48 pontos mensais (jul/2022 a jun/2026). */
export interface PontoSerie {
  mes: Mes
  receita: Indicador
  energia: Indicador
}

/** receita_comparacao + efeito_preco + efeito_volume + bandeira_mix = receita_atual. */
export interface PonteReceita {
  receita_comparacao: Indicador
  efeito_preco: Indicador
  efeito_volume: Indicador
  bandeira_mix: Indicador
  receita_atual: Indicador
  reajuste_percentual: Indicador
}

export interface FiltrosLinha {
  municipio: string | null
  bairro: string | null
  classe: string | null
}

export interface ItemBreadcrumb {
  nivel: 'consolidado' | 'municipio' | 'bairro'
  rotulo: string
  filtros: FiltrosLinha
}

export interface LinhaDrill {
  nivel: NivelDrill
  nome: string
  receita_atual: Indicador
  receita_comparacao: Indicador
  energia_atual: Indicador
  energia_comparacao: Indicador
  variacao_energia_percentual: Indicador
  queda_kwh: Indicador
  efeito_preco: Indicador
  efeito_volume: Indicador
  /** Reenviar estes filtros, com o próximo nível, ao selecionar a linha. */
  filtros: FiltrosLinha
}

export interface DrillDown extends Pagina<LinhaDrill> {
  nivel: NivelDrill
  breadcrumb: ItemBreadcrumb[]
}

export interface Dashboard {
  filtros: Contexto
  indicadores: IndicadoresDashboard
  serie_historica: PontoSerie[]
  ponte_receita: PonteReceita
  drill_down: DrillDown
  metadados: Metadados
}
