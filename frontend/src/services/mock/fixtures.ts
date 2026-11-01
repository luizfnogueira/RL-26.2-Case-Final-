import type { Comparacao, Dashboard } from '@/types/dashboard'
import type { PerguntaIA, RespostaIA, RespostaInsight } from '@/types/ia'
import type { Candidatos, Ordens } from '@/types/inspecoes'
import type { Operacao } from '@/types/operacao'
import type { Unidade360, Unidades } from '@/types/unidades'
import { clonar } from './util'

/** Linha de `dashboard_recortes.json`: valores fictícios por município, bairro e classe. */
export interface Recorte {
  municipio: string
  bairro: string
  classe: string
  alimentador: string
  receita_atual: number
  receita_comparacao: number
  energia_atual: number
  energia_comparacao: number
  ucs_ativas_atual: number
  ucs_ativas_comparacao: number
  inadimplencia_atual: number
  inadimplencia_comparacao: number
}

// Os JSON são importados sob demanda: com VITE_USE_MOCKS=false nada disso entra no carregamento.
async function carregar<T>(modulo: Promise<{ default: unknown }>): Promise<T> {
  return clonar((await modulo).default) as T
}

/** Cada chamada devolve uma cópia independente: alterar o resultado não afeta os mocks. */
export const fixtures = {
  dashboard: () => carregar<Dashboard>(import('@/data/mocks/dashboard.json')),
  comparacao: () => carregar<Comparacao>(import('@/data/mocks/comparacao.json')),
  recortes: () => carregar<{ recortes: Recorte[] }>(import('@/data/mocks/dashboard_recortes.json')),
  unidades: () => carregar<Unidades>(import('@/data/mocks/unidades.json')),
  unidade: () => carregar<Unidade360>(import('@/data/mocks/unidade.json')),
  unidadeRecente: () => carregar<Unidade360>(import('@/data/mocks/unidade_recente.json')),
  candidatos: () => carregar<Candidatos>(import('@/data/mocks/candidatos.json')),
  inspecoes: () => carregar<Ordens>(import('@/data/mocks/inspecoes.json')),
  operacao: () => carregar<Operacao>(import('@/data/mocks/operacao.json')),
  perguntaIa: () => carregar<PerguntaIA>(import('@/data/mocks/pergunta_ia.json')),
  respostaIa: () => carregar<RespostaIA>(import('@/data/mocks/resposta_ia.json')),
  respostaIaNaoSei: () => carregar<RespostaIA>(import('@/data/mocks/resposta_ia_nao_sei.json')),
  respostaIaBloqueado: () =>
    carregar<RespostaIA>(import('@/data/mocks/resposta_ia_bloqueado.json')),
  respostaIaEsclarecer: () =>
    carregar<RespostaIA>(import('@/data/mocks/resposta_ia_esclarecer.json')),
  respostaIaEsclarecerAno: () =>
    carregar<RespostaIA>(import('@/data/mocks/resposta_ia_esclarecer_ano.json')),
  respostaIaGrafico: {
    barras: () => carregar<RespostaIA>(import('@/data/mocks/resposta_ia_grafico_barras.json')),
    pizza: () => carregar<RespostaIA>(import('@/data/mocks/resposta_ia_grafico_pizza.json')),
    linhas: () => carregar<RespostaIA>(import('@/data/mocks/resposta_ia_grafico_linhas.json')),
  },
  respostaInsight: () => carregar<RespostaInsight>(import('@/data/mocks/resposta_insight.json')),
  respostaInsightUnidade: () =>
    carregar<RespostaInsight>(import('@/data/mocks/resposta_insight_unidade.json')),
  /** Formato do modo real (GOLD_SOURCE=real), fictício; o mock do insight segue o stub do seed. */
  respostaInsightUnidadeReal: () =>
    carregar<RespostaInsight>(import('@/data/mocks/resposta_insight_unidade_real.json')),
}
