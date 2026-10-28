import type { Indicador } from '@/types/comum'
import type { IndicadoresDashboard } from '@/types/dashboard'
import {
  formatarEnergia,
  formatarPercentual,
  formatarReais,
  formatarReaisCompleto,
} from '@/utils/formatacao'

export const ORDEM_KPIS: readonly (keyof IndicadoresDashboard)[] = [
  'receita_faturada',
  'energia_faturada',
  'ucs_ativas',
  'inadimplencia',
  'dec_medio',
  'fec_medio',
]

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** Continuidade preserva as casas decimais; ausência continua ausente. */
export function valorExecutivo({ valor, unidade }: Indicador, completo = false): string {
  if (valor === null) return '—'
  if (unidade === 'BRL') return completo ? formatarReaisCompleto(valor) : formatarReais(valor)
  if (unidade === 'kWh') return completo ? `${decimal.format(valor)} kWh` : formatarEnergia(valor)
  return unidade === 'UCs' ? inteiro.format(valor) : decimal.format(valor)
}

export function leituraDoPeriodo(indicadores: IndicadoresDashboard): string {
  const receita = indicadores.receita_faturada.variacao_percentual.valor
  const energia = indicadores.energia_faturada.variacao_percentual.valor
  if (receita === null || energia === null) {
    return 'Consulte a evolução mensal e o diagnóstico para explorar este recorte.'
  }
  const movimento = (valor: number) =>
    valor > 0 ? 'cresceu' : valor < 0 ? 'recuou' : 'ficou estável'
  const trecho = (valor: number) => (valor === 0 ? '' : ` ${formatarPercentual(Math.abs(valor))}`)
  return `A receita faturada ${movimento(receita)}${trecho(receita)} e o volume ${movimento(energia)}${trecho(energia)} em relação ao período de comparação.`
}
