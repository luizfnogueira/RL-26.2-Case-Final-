import type { Periodo } from '@/types/comum'

/** Janela anual atual do case: 12 meses (jul/2025 a jun/2026). */
export const PERIODO_ATUAL_PADRAO: Periodo = '2025-07/2026-06'
/** Primeiro ano da base (jul/2022 a jun/2023), usado como comparação. */
export const PERIODO_COMPARACAO_PADRAO: Periodo = '2022-07/2023-06'

const PADRAO = /^(\d{4})-(0[1-9]|1[0-2])(?:\/(\d{4})-(0[1-9]|1[0-2]))?$/
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export interface LimitesPeriodo {
  /** YYYY-MM, inclusivo. */
  inicio: string
  /** YYYY-MM, inclusivo. */
  fim: string
}

/** Separa "YYYY-MM/YYYY-MM" (ou "YYYY-MM") em início e fim; null se o formato for inválido. */
export function limitesDoPeriodo(periodo: Periodo): LimitesPeriodo | null {
  const m = PADRAO.exec(periodo)
  if (!m) return null
  const inicio = `${m[1]}-${m[2]}`
  const fim = m[3] ? `${m[3]}-${m[4]}` : inicio
  return { inicio, fim }
}

function indiceMes(mes: string): number {
  return Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1
}

/** Quantidade de meses do período, ou null se o formato for inválido. */
export function duracaoEmMeses(periodo: Periodo): number | null {
  const limites = limitesDoPeriodo(periodo)
  if (!limites) return null
  return indiceMes(limites.fim) - indiceMes(limites.inicio) + 1
}

/** true se o período tem formato válido e início ≤ fim. */
export function periodoValido(periodo: Periodo): boolean {
  const duracao = duracaoEmMeses(periodo)
  return duracao !== null && duracao >= 1
}

/** "2026-06" → "Jun/2026". */
export function formatarMes(mes: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes)
  return m ? `${MESES[Number(m[2]) - 1]}/${m[1]}` : mes
}

/** "2025-07/2026-06" → "Jul/2025 – Jun/2026"; um mês isolado vira "Jun/2026". */
export function formatarPeriodo(periodo: Periodo): string {
  const limites = limitesDoPeriodo(periodo)
  if (!limites) return periodo
  return limites.inicio === limites.fim
    ? formatarMes(limites.inicio)
    : `${formatarMes(limites.inicio)} – ${formatarMes(limites.fim)}`
}

/** true se o mês (YYYY-MM) está dentro do período, com início e fim inclusivos. */
export function mesNoPeriodo(mes: string, periodo: Periodo): boolean {
  const limites = limitesDoPeriodo(periodo)
  return limites !== null && limites.inicio <= mes && mes <= limites.fim
}

/**
 * Últimos `quantidade` meses, do mais recente para o mais antigo, em YYYY-MM.
 * Usado em telas cujo `periodo_atual` é o mês de criação (ordens), não uma janela da Gold.
 */
export function mesesRecentes(quantidade: number, referencia: Date = new Date()): string[] {
  const meses: string[] = []
  for (let i = 0; i < quantidade; i += 1) {
    const data = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1)
    meses.push(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`)
  }
  return meses
}
