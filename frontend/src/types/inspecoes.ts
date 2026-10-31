import type { FiltrosRegiao, Indicador, Metadados, Pagina, ParamsPaginacao, Periodo } from './comum'

/** Fluxo: ABERTA → EM_CAMPO → CONCLUIDA; cancelar a partir de ABERTA ou EM_CAMPO. */
export type StatusOrdem = 'ABERTA' | 'EM_CAMPO' | 'CONCLUIDA' | 'CANCELADA'

/** Ordens ativas: no máximo uma por UC. */
export const STATUS_ATIVOS: readonly StatusOrdem[] = ['ABERTA', 'EM_CAMPO']

// ---------- Fila (GET /inspecoes/candidatos) ----------

export interface ParamsCandidatos extends FiltrosRegiao, ParamsPaginacao {
  periodo_atual: Periodo
  periodo_comparacao?: Periodo
  sem_ordem_ativa?: boolean
}

export type ConfiancaEvidencia = 'ALTA' | 'MEDIA' | 'BAIXA' | 'INDETERMINADA'
export type AcaoRecomendada = 'INSPECAO_PRIORITARIA' | 'VALIDACAO_DOCUMENTAL'

export interface Candidato {
  id_uc: string
  municipio: string
  bairro: string
  classe: string
  alimentador: string
  /** Posição global após filtros, antes da paginação. */
  posicao: number
  motivos: string[]
  acao_recomendada: AcaoRecomendada
  /** Estimativa futura em kWh; não é o kWh já recuperado do histórico. */
  energia_estimada: Indicador
  /** De 0 a 100. */
  score: number
  /** Score não é probabilidade de fraude; a energia estimada não é energia comprovada. */
  confianca_evidencia: ConfiancaEvidencia
  /** Somente INSPECAO_PRIORITARIA sem ordem ativa pode gerar ordem de campo. */
  ordem_ativa: boolean
  id_ordem_ativa: number | null
}

export interface ResumoCandidatos {
  ucs_analisadas: Indicador
  ucs_priorizadas: Indicador
  potencial_recuperacao: Indicador
  ordens_ativas: Indicador
}

export interface Candidatos extends Pagina<Candidato> {
  periodo_referencia: Periodo
  resumo: ResumoCandidatos
  metadados: Metadados
}

// ---------- Ordens (GET/POST/PATCH /inspecoes) ----------

export interface ParamsInspecoes extends FiltrosRegiao, ParamsPaginacao {
  id_uc?: string
  status?: StatusOrdem
  /** Mês de criação da ordem. */
  periodo_atual?: Periodo
}

/** Resultado de campo, como a API devolve. */
export interface Resultado {
  irregularidade_detectada: boolean
  tipo_irregularidade: string | null
  kwh_recuperado: number
  observacoes: string
  data_inspecao: string | null
  inspetor: string | null
}

/**
 * Resultado de campo, como o front envia. Com irregularidade: tipo obrigatório e kWh não
 * negativo. Sem irregularidade: tipo vazio e kWh zero.
 */
export interface ResultadoEnvio {
  irregularidade_detectada: boolean
  tipo_irregularidade?: string | null
  kwh_recuperado?: number
  /** Obrigatória. */
  observacoes: string
  data_inspecao?: string | null
  inspetor?: string | null
}

export interface Historico {
  id_historico: number
  id_ordem: number
  status_anterior: StatusOrdem | null
  status_novo: StatusOrdem
  data_mudanca: string
  usuario: string | null
  justificativa_ou_motivo: string | null
  detalhes: Record<string, unknown> | null
}

export interface Ordem {
  id_ordem: number
  id_uc: string
  status: StatusOrdem
  equipe_responsavel: string
  data_criacao: string
  /** Data prevista é um campo, não um status. */
  data_prevista: string | null
  data_inicio_campo: string | null
  data_conclusao: string | null
  data_cancelamento: string | null
  justificativa_cancelamento: string | null
  motivo: string | null
  kwh_estimado: number | null
  observacoes: string | null
  resultado: Resultado | null
  historico: Historico[]
}

/** Contagem por status após filtros de UC, região e período, antes do filtro `status`. */
export type ContagemStatus = Record<StatusOrdem, number>

export interface Ordens extends Pagina<Ordem> {
  contagem_status: ContagemStatus
  metadados: Metadados
}

export interface CriarInspecao {
  id_uc: string
  equipe_responsavel: string
  /** Opcional na API; a modal pode exigir antes de enviar. Formato YYYY-MM-DD. */
  data_prevista?: string | null
  motivo?: string | null
  kwh_estimado?: number | null
  observacoes?: string | null
}

/** Corpo de POST /inspecoes/lote: de 1 a 200 ordens, criadas todas ou nenhuma. */
export interface CriarInspecoesLote {
  ordens: CriarInspecao[]
}

export interface OrdensCriadas {
  items: Ordem[]
  total: number
}

/** Uma UC recusada no lote (`detalhes.falhas` do 422 LOTE_REJEITADO). */
export interface FalhaLote {
  id_uc: string
  codigo: string
  mensagem: string
}

export interface IniciarCampo {
  status: 'EM_CAMPO'
  /** A equipe pode mudar ao iniciar o campo. */
  equipe_responsavel?: string
  observacoes?: string
}

export interface ConcluirInspecao {
  status: 'CONCLUIDA'
  resultado: ResultadoEnvio
}

export interface CancelarInspecao {
  status: 'CANCELADA'
  /** Obrigatória no cancelamento. */
  justificativa: string
}

/** Corpo do PATCH /inspecoes/{id}. */
export type AtualizarInspecao = IniciarCampo | ConcluirInspecao | CancelarInspecao
