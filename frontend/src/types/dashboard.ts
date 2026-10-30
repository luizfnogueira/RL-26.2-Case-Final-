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

export interface IndicadoresDashboard {
  receita_faturada: Kpi
  energia_faturada: Kpi
  ucs_ativas: Kpi
  inadimplencia: KpiInadimplencia
  /** null com filtro de bairro, classe ou alimentador: a continuidade só é agregada por alimentador e município. */
  dec_medio: Kpi
  fec_medio: Kpi
}

/** Um dos 48 pontos mensais (jul/2022 a jun/2026). */
export interface PontoSerie {
  mes: Mes
  receita: Indicador
  energia: Indicador
}

/**
 * Decomposição da receita de energia (sem tributos), como em gold.agg_preco_volume:
 * receita_energia_comparacao + efeito_preco + efeito_volume = receita_energia_atual, sem resíduo.
 * Fora de P1 × P2 ou com filtro de alimentador, todos os valores vêm null.
 */
export interface PonteReceita {
  receita_energia_comparacao: Indicador
  efeito_preco: Indicador
  efeito_volume: Indicador
  receita_energia_atual: Indicador
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
  receita_energia_atual: Indicador
  receita_energia_comparacao: Indicador
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

/**
 * Query de GET /dashboard/comparacao (contrato, seção 3.1). `itens` vai repetido na URL
 * (itens=A&itens=B). nivel=bairro exige municipio; nivel=classe aceita municipio e bairro.
 */
export interface ParamsComparacao {
  periodo_atual: Periodo
  periodo_comparacao: Periodo
  nivel: NivelDrill
  /** 2 a 4, sem repetição, com os valores exatos do GET /filtros (ex.: RECIFE). */
  itens: readonly string[]
  municipio?: string
  bairro?: string
}

/** Um recorte da comparação: seis KPIs no formato do painel. */
export interface ItemComparacao {
  nome: string
  ucs_ativas: Kpi
  /** Receita faturada ÷ UCs ativas ÷ meses da janela (BRL/UC/mes). */
  receita_media_uc: Kpi
  /** Volume faturado ÷ UCs ativas ÷ meses da janela (kWh/UC/mes). */
  consumo_medio_uc: Kpi
  /** Valor em aberto em % da receita; `diferenca` em pontos percentuais (p.p.). */
  valor_em_aberto_pct: Kpi
  /** null em bairro e classe, como no painel. */
  dec: Kpi
  fec: Kpi
}

export interface Comparacao {
  filtros: Contexto & { nivel: NivelDrill; itens: string[] }
  /** Na ordem pedida. Item sem UCs no recorte: ucs_ativas 0 e os demais null. */
  itens: ItemComparacao[]
  metadados: Metadados
}
