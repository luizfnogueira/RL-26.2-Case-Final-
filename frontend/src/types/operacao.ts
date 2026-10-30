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
/** `chi` ordena pelas horas de interrupção (consumidor-hora interrompido). */
export type OrdenarPor = 'dec' | 'fec' | 'chi'

/** Query de GET /operacao. A API não suporta `classe` e retorna 422 DADOS_INVALIDOS. */
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
  /** Sem os dias críticos (expurgo do PRODIST). */
  dec_sem_dia_critico: Indicador
  fec_sem_dia_critico: Indicador
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
  dec_sem_dia_critico: Indicador
  fec_sem_dia_critico: Indicador
  interrupcoes: Indicador
  /** CHI: horas sem energia somadas nas UCs. */
  horas_interrupcao: Indicador
}

export interface RankingRegional {
  posicao: number
  municipio: string
  /** null quando `nivel_regional` é `municipio`. */
  bairro: string | null
  dec: Indicador
  fec: Indicador
  dec_sem_dia_critico: Indicador
  fec_sem_dia_critico: Indicador
  interrupcoes: Indicador
  horas_interrupcao: Indicador
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
