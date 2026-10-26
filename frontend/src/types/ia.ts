import type { ContextoEnvio, IndicadorNomeado, Metadados } from './comum'

/** `nao_sei` e `bloqueado` são respostas válidas (HTTP 200), não erros de transporte. */
export type StatusIA = 'ok' | 'nao_sei' | 'bloqueado'

export interface PerguntaIA {
  /** De 1 a 2000 caracteres. */
  pergunta: string
  contexto?: ContextoEnvio | null
}

export type CelulaIA = string | number | boolean | null

/** Dados retornados pela consulta. Cada linha segue a ordem de `colunas`. */
export interface DadosIA {
  colunas: string[]
  linhas: CelulaIA[][]
}

/** Os campos `sql`, `tabelas` e `dados` alimentam o bloco "Como cheguei nisso". */
export interface RespostaIA {
  resposta: string
  sql: string | null
  tabelas: string[]
  dados: DadosIA
  status: StatusIA
  gerado_em: string
  metadados: Metadados
}

export type ContextoInsight = 'receita' | 'unidade'

export interface PedidoInsight {
  contexto: ContextoInsight
  /** Receita exige os dois períodos. Unidade exige `id_uc`. */
  filtros: ContextoEnvio
  id_uc?: string | null
  /** Opcional no stub; na integração real a API valida contra a Gold. */
  indicadores?: IndicadorNomeado[]
}

/**
 * Quando o módulo de IA falha, a API devolve 200 com um texto por regra e uma observação que
 * começa por este prefixo (contrato, seção 10). Nesse caso o texto não é "gerado por IA".
 */
export const PREFIXO_TEXTO_ALTERNATIVO = 'Texto alternativo:'

export interface RespostaInsight {
  titulo: string
  texto: string
  /** Receita: 6 números. Unidade: 4 números do diagnóstico da conta. */
  numeros_utilizados: IndicadorNomeado[]
  gerado_em: string
  metadados: Metadados
}
