import type {
  FiltrosRegiao,
  Indicador,
  Mes,
  Metadados,
  Pagina,
  ParamsPaginacao,
  Periodo,
} from './comum'

export type NivelRegional = 'municipio' | 'bairro'
export type OrdenarPor = 'dec' | 'fec'

/** Query de GET /operacao. O filtro `classe` não existe no mock operacional (retorna erro). */
export interface ParamsOperacao extends FiltrosRegiao, ParamsPaginacao {
  periodo_atual: Periodo
  /** Padrão `dec`. */
  ordenar_por?: OrdenarPor
  /** Padrão `municipio`. */
  nivel_regional?: NivelRegional
}

export interface PontoOperacao {
  mes: Mes
  dec: Indicador
  fec: Indicador
}

/** Série mensal de DEC e FEC de um alimentador. Não é truncada pela paginação. */
export interface SerieAlimentador {
  alimentador: string
  pontos: PontoOperacao[]
}

export interface RankingAlimentador {
  posicao: number
  alimentador: string
  municipio: string
  bairros_atendidos: string[]
  ucs_atendidas: number
  dec: Indicador
  fec: Indicador
  interrupcoes: Indicador
}

export interface RankingRegional {
  posicao: number
  municipio: string
  /** null quando `nivel_regional` é `municipio`. */
  bairro: string | null
  dec: Indicador
  fec: Indicador
  interrupcoes: Indicador
}

export type RankingAlimentadores = Pagina<RankingAlimentador>

export interface RankingRegionalPagina extends Pagina<RankingRegional> {
  nivel_regional: NivelRegional
}

export interface FiltrosOperacaoAplicados {
  periodo_atual: Periodo
  municipio: string | null
  bairro: string | null
  classe: string | null
  alimentador: string | null
  ordenar_por: OrdenarPor
}

export interface Operacao {
  filtros: FiltrosOperacaoAplicados
  serie_historica: SerieAlimentador[]
  ranking_alimentadores: RankingAlimentadores
  ranking_regional: RankingRegionalPagina
  metadados: Metadados
}
