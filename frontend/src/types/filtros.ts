import type { Metadados, Periodo } from './comum'

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

/** GET /filtros: valores aceitos nos filtros, exatamente como estão no banco (ex.: RECIFE). */
export interface RespostaFiltros {
  municipios: string[]
  /** O mesmo nome de bairro existe em vários municípios: o par é a chave. */
  bairros: { municipio: string; bairro: string }[]
  classes: string[]
  alimentadores: { alimentador: string; municipio: string }[]
  metadados: Metadados
}

/** Listas que alimentam as listas suspensas (vêm de GET /filtros pelo useOpcoesFiltros). */
export interface OpcoesFiltros {
  /** Janelas disponíveis para os dois filtros de período. */
  periodos?: readonly Periodo[]
  municipios?: readonly string[]
  /** Lista única, ou bairros por município (o bairro só habilita depois do município). */
  bairros?: readonly string[] | Readonly<Record<string, readonly string[]>>
  classes?: readonly string[]
  alimentadores?: readonly string[]
}
