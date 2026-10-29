import type { ContextoEnvio, IndicadorNomeado, Metadados } from './comum'

/** `nao_sei` e `bloqueado` são respostas válidas (HTTP 200), não erros de transporte. */
export type StatusIA = 'ok' | 'nao_sei' | 'bloqueado'

/** Entrada do POST /ia: a pergunta e, a partir da segunda, o id da conversa. */
export interface PerguntaIA {
  /** De 1 a 2000 caracteres. */
  pergunta: string
  /** Devolvido pelo backend na primeira resposta; reenviar mantém a memória da conversa. */
  conversa_id?: string | null
}

export type CelulaIA = string | number | boolean | null

/** Dados retornados pela consulta. Cada linha segue a ordem de `colunas`. */
export interface DadosIA {
  colunas: string[]
  linhas: CelulaIA[][]
}

export type ApresentacaoIA = 'texto' | 'tabela' | 'grafico'

export interface SerieGrafico {
  nome: string
  /** Um valor por categoria, na mesma ordem; null = sem dado (buraco na linha). */
  valores: (number | null)[]
}

/**
 * Gráfico montado pelo backend a partir de `dados` (contrato, seção 9). Os valores vêm do banco,
 * já ordenados e cortados (até 20 barras, 5 fatias com "Outros", 4 séries).
 */
export interface GraficoIA {
  tipo: 'barras' | 'pizza' | 'linhas'
  titulo: string
  /** Como formatar as categorias: nomes da Gold, meses (YYYY-MM) ou P1/P2. */
  eixo: 'categoria' | 'tempo' | 'periodo'
  orientacao: 'horizontal' | 'vertical' | null
  unidade: 'brl' | 'kwh' | 'pct' | 'h' | null
  categorias: string[]
  series: SerieGrafico[]
  origem: 'automatico' | 'pedido'
  /** Categorias ou séries fora do limite do gráfico; a tabela completa segue em `dados`. */
  omitidos: number
  nota: string | null
}

export interface PlanoIA {
  tabelas: string[]
  colunas: string[]
  filtros: string[]
  agregacao: string | null
  ordenacao: string | null
  limite: number | null
  periodo: string | null
}

/** Uma ferramenta chamada pelo agente (pensamento → ação → observação). */
export interface AcaoIA {
  ordem: number
  ferramenta: string
  argumentos: Record<string, unknown>
  resumo_retorno: string
  sucesso: boolean
}

/** Métricas por status no golden set; razões de 0 a 1. */
export interface MetricasStatus {
  precisao: number
  recall: number
  f1: number
}

/** Resumo do último run da avaliação (avaliacao_ultima.json); as chaves podem faltar. */
export interface AvaliacaoIA {
  executado_em?: string
  n_perguntas?: number
  configuracao?: string
  acuracia_execucao?: number
  taxa_invencao?: number
  bloqueio_ataques?: number
  f1_macro?: number
  por_status?: Partial<Record<StatusIA, MetricasStatus>>
}

/** Painel "Detalhes técnicos" (contrato, seção 9). */
export interface DetalhesTecnicos {
  estrutura_pensamento: {
    pergunta_interpretada: string
    plano: PlanoIA | null
    skills: string[]
    premissas: string[]
    /** Declarada pelo modelo, não auditada. */
    justificativa: string
  }
  acoes: AcaoIA[]
  consulta: { sql_executado: string | null; tentativas: number; linhas: number }
  tokens_tempo: {
    tokens_entrada: number
    tokens_saida: number
    tokens_raciocinio: number
    chamadas: number
    latencia_total_ms: number
    etapas_ms: Record<string, number>
    modelo: string | null
    provedor: string | null
    cache: boolean
  }
  verificacoes: {
    sql_validado: boolean | null
    numeros_conferidos: boolean | null
    confianca: 'alta' | 'media' | 'baixa' | null
  }
  avaliacao: AvaliacaoIA | null
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
  /** Campos da sprint de GenAI: opcionais, ausentes em respostas antigas. */
  conversa_id?: string | null
  /** `tabela`: os `dados` aparecem como tabela no corpo da resposta; `grafico`: o `grafico` abaixo. */
  apresentacao?: ApresentacaoIA | null
  detalhes_tecnicos?: DetalhesTecnicos | null
  /** Presente só com `apresentacao: "grafico"`. */
  grafico?: GraficoIA | null
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
