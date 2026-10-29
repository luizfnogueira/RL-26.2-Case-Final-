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

// ---------- GET /filtros (domínios lidos da Gold) ----------

/** Bairro sempre vem com o município: o mesmo nome existe em cidades diferentes. */
export interface OpcaoBairro {
  municipio: string
  bairro: string
}

/** Alimentador sempre vem com o município que ele atende. */
export interface OpcaoAlimentador {
  alimentador: string
  municipio: string
}

/**
 * Resposta de `GET /filtros`. Os valores são exatamente os do cadastro de UCs da Gold
 * (maiúsculas, ex.: `RECIFE`, `BOA VISTA`) e são os mesmos enviados nas outras rotas.
 */
export interface OpcoesFiltrosApi {
  municipios: string[]
  bairros: OpcaoBairro[]
  classes: string[]
  alimentadores: OpcaoAlimentador[]
  metadados: Metadados
}

// ---------- Formato consumido pela BarraDeFiltros ----------

/** Listas que alimentam as listas suspensas da barra de filtros. */
export interface OpcoesFiltros {
  /** Janelas disponíveis para os dois filtros de período. */
  periodos?: readonly Periodo[]
  municipios?: readonly string[]
  /** Lista única, ou bairros por município (o bairro só habilita depois do município). */
  bairros?: readonly string[] | Readonly<Record<string, readonly string[]>>
  classes?: readonly string[]
  /**
   * Lista única, ou alimentadores por município. A API devolve o município de cada
   * alimentador; a barra usa isso para filtrar a lista quando há município escolhido.
   */
  alimentadores?: readonly string[] | Readonly<Record<string, readonly string[]>>
}
