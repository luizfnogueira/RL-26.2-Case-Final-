// Tipos comuns do contrato da API V2 (docs/api-contract.md, backend/app/schemas/common.py).
// Tipos TypeScript descrevem o contrato, mas não validam a resposta em tempo de execução.

/** Mês no formato YYYY-MM. */
export type Mes = string

/** YYYY-MM ou YYYY-MM/YYYY-MM, com início e fim inclusivos. Ex.: 2025-07/2026-06. */
export type Periodo = string

export interface Indicador {
  /** null significa ausente; nunca converter ausência em zero. */
  valor: number | null
  unidade: string
  periodo_referencia: Periodo
}

export interface IndicadorNomeado extends Indicador {
  nome: string
  rotulo: string
}

export interface Metadados {
  /** true identifica o mock/stub. */
  dados_ficticios: boolean
  /** Instante da última carga da Gold (ISO 8601 com fuso), distinto de `gerado_em` da IA. */
  gold_atualizada_em: string | null
  observacoes: string[]
}

/** Resposta paginada. `total` é a contagem após filtros e antes da paginação. */
export interface Pagina<T> {
  items: T[]
  page: number
  page_size: number
  total: number
}

/** Filtros geográficos enviados na query string. `bairro` exige `municipio`. */
export interface FiltrosRegiao {
  municipio?: string
  bairro?: string
  classe?: string
  alimentador?: string
}

export interface ParamsPaginacao {
  /** Padrão 1. */
  page?: number
  /** Padrão 20; entre 1 e 100. */
  page_size?: number
}

/** Contexto devolvido pela API: todas as chaves presentes, null quando não aplicável. */
export interface Contexto {
  periodo_atual: Periodo
  periodo_comparacao: Periodo | null
  municipio: string | null
  bairro: string | null
  classe: string | null
  alimentador: string | null
}

/** Contexto enviado à API (POST /ia e /ia/insight): só `periodo_atual` é obrigatório. */
export interface ContextoEnvio {
  periodo_atual: Periodo
  periodo_comparacao?: Periodo | null
  municipio?: string | null
  bairro?: string | null
  classe?: string | null
  alimentador?: string | null
}

/** Formato único de erro da API. */
export interface ErroApiCorpo {
  codigo: string
  mensagem: string
}

/**
 * Códigos de erro do contrato (seção 2) mais os gerados no próprio front.
 * A união aceita códigos novos sem quebrar a compilação.
 */
export type CodigoErro =
  | 'TRANSICAO_INVALIDA'
  | 'JUSTIFICATIVA_OBRIGATORIA'
  | 'RESULTADO_INCOMPLETO'
  | 'UC_INEXISTENTE'
  | 'ORDEM_NAO_ENCONTRADA'
  | 'ORDEM_ATIVA_EXISTENTE'
  /** 422 do POST /inspecoes/lote: nenhuma ordem criada; as UCs com problema vêm em `detalhes.falhas`. */
  | 'LOTE_REJEITADO'
  | 'DADOS_INVALIDOS'
  | 'CENARIO_STUB_INDISPONIVEL'
  | 'RECURSO_NAO_ENCONTRADO'
  | 'DADOS_INDISPONIVEIS'
  /** 503 do POST /ia: agente fora do ar, lento além do timeout ou com resposta fora do contrato. */
  | 'AGENTE_INDISPONIVEL'
  /** 503 do GET /unidades/{id}: Gold não carregada no banco (dim_mes vazia). */
  | 'GOLD_NAO_CARREGADA'
  | 'ERRO_INTERNO'
  /** Gerado no front: a API não respondeu (rede, CORS, servidor fora do ar). */
  | 'REDE_INDISPONIVEL'
  /** Gerado no front: resposta fora do formato esperado. */
  | 'RESPOSTA_INVALIDA'
  | (string & {})
