import type { Indicador } from '@/types/comum'

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

export function numeroOperacao(valor: number | null, contar = false): string {
  if (valor === null) return '—'
  return (contar ? inteiro : decimal).format(valor)
}

export function unidadeOperacao(indicador: Indicador): string {
  if (indicador.unidade === 'interrupcoes/UC') return 'interrupções/UC'
  if (indicador.unidade === 'interrupcoes') return 'interrupções'
  return indicador.unidade
}

export type IndicadorHistorico = 'dec' | 'fec'
export const SEM_CRITICO = { dec: 'dec_sem_dia_critico', fec: 'fec_sem_dia_critico' } as const

/** O grão continua sendo alimentador × mês; uma lacuna interrompe o traçado. */
export function caminhoContinuidade(
  valores: readonly (number | null)[],
  x: (indice: number) => number,
  y: (valor: number) => number,
): string {
  let inicio = true
  return valores
    .map((valor, i) => {
      if (valor === null) {
        inicio = true
        return ''
      }
      const comando = inicio ? 'M' : 'L'
      inicio = false
      return `${comando}${x(i).toFixed(2)},${y(valor).toFixed(2)}`
    })
    .join(' ')
}
