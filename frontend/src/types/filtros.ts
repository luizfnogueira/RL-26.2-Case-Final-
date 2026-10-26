import type { Periodo } from './comum'

/** Filtros que a BarraDeFiltros sabe exibir. Os nomes são os mesmos parâmetros da API. */
export const CAMPOS_FILTRO = [
  'periodo_atual',
  'periodo_comparacao',
  'municipio',
  'bairro',
  'classe',
  'alimentador',
] as const

export type CampoFiltro = (typeof CAMPOS_FILTRO)[number]

/** Valores lidos da URL. Só aparecem as chaves preenchidas; ausente significa "todos". */
export type FiltrosUrl = Partial<Record<CampoFiltro, string>>

/** Listas que alimentam as listas suspensas. A API ainda não tem rota de domínios dos filtros. */
export interface OpcoesFiltros {
  /** Janelas disponíveis para os dois filtros de período. */
  periodos?: readonly Periodo[]
  municipios?: readonly string[]
  /** Lista única, ou bairros por município (o bairro só habilita depois do município). */
  bairros?: readonly string[] | Readonly<Record<string, readonly string[]>>
  classes?: readonly string[]
  alimentadores?: readonly string[]
}
