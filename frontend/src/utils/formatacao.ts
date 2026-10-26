import type { Indicador } from '@/types/comum'

const MENOS = '−' // sinal de menos tipográfico (U+2212), não o hífen

const umaCasa = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const duasCasas = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const reaisCompleto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

interface OpcoesSinal {
  /** Mostra "+" nos valores positivos. Negativos sempre levam "−". */
  sinal?: boolean
}

function comSinal(valor: number, texto: string, sinal?: boolean): string {
  if (valor < 0) return `${MENOS}${texto}`
  return sinal && valor > 0 ? `+${texto}` : texto
}

/** "R$ 24,7 mi", "R$ 8,2 mil", "R$ 120,00". Com `sinal`: "+R$ 24,7 mi", "−R$ 8,2 mi". */
export function formatarReais(valor: number, { sinal }: OpcoesSinal = {}): string {
  const abs = Math.abs(valor)
  let texto: string
  if (abs >= 1e9) texto = `R$ ${umaCasa.format(abs / 1e9)} bi`
  else if (abs >= 1e6) texto = `R$ ${umaCasa.format(abs / 1e6)} mi`
  else if (abs >= 1e3) texto = `R$ ${umaCasa.format(abs / 1e3)} mil`
  else texto = `R$ ${duasCasas.format(abs)}`
  return comSinal(valor, texto, sinal)
}

/** "R$ 222.421.875,00": valor inteiro, para tabelas e leitores de tela. */
export function formatarReaisCompleto(valor: number): string {
  return reaisCompleto.format(valor).replace(/\s/g, ' ').replace(/^-/, MENOS)
}

/** kWh em GWh, MWh ou kWh conforme a grandeza: "19,8 GWh". */
export function formatarEnergia(kwh: number, { sinal }: OpcoesSinal = {}): string {
  const abs = Math.abs(kwh)
  let texto: string
  if (abs >= 1e6) texto = `${umaCasa.format(abs / 1e6)} GWh`
  else if (abs >= 1e3) texto = `${umaCasa.format(abs / 1e3)} MWh`
  else texto = `${inteiro.format(abs)} kWh`
  return comSinal(kwh, texto, sinal)
}

/** "+8,0%", "−3,9%". O valor já vem em pontos percentuais (8 = 8%). */
export function formatarPercentual(valor: number, { sinal = false }: OpcoesSinal = {}): string {
  return comSinal(valor, `${umaCasa.format(Math.abs(valor))}%`, sinal)
}

/** Formata um indicador da API pela unidade; null vira travessão (nunca zero). */
export function formatarIndicador(indicador: Pick<Indicador, 'valor' | 'unidade'>): string {
  const { valor, unidade } = indicador
  if (valor === null) return '—'
  switch (unidade) {
    case 'BRL':
      return formatarReais(valor)
    case 'kWh':
      return formatarEnergia(valor)
    case '%':
      return formatarPercentual(valor)
    default:
      return `${inteiro.format(valor)} ${unidade}`
  }
}
