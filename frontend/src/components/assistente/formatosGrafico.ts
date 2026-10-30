import type { Formatos } from '@/components/graficos/comum'
import type { GraficoIA } from '@/types/ia'
import {
  formatarEnergia,
  formatarNome,
  formatarPercentual,
  formatarReais,
  formatarReaisCompleto,
} from '@/utils/formatacao'
import { formatarMes, formatarPeriodo } from '@/utils/periodos'

const umaCasa = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const duasCasas = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
// Sinal de menos tipográfico (U+2212), como o resto do portal (utils/formatacao).
const menos = (texto: string) => texto.replace(/^-/, '−')

function compacto(valor: number): string {
  const abs = Math.abs(valor)
  if (abs >= 1e6) return menos(`${umaCasa.format(valor / 1e6)} mi`)
  if (abs >= 1e3) return menos(`${umaCasa.format(valor / 1e3)} mil`)
  return menos(duasCasas.format(valor))
}

const VALORES: Record<string, Pick<Formatos, 'valor' | 'valorCompleto'>> = {
  brl: { valor: (v) => formatarReais(v), valorCompleto: formatarReaisCompleto },
  kwh: { valor: (v) => formatarEnergia(v), valorCompleto: (v) => menos(`${duasCasas.format(v)} kWh`) },
  pct: { valor: (v) => formatarPercentual(v), valorCompleto: (v) => menos(`${duasCasas.format(v)}%`) },
  h: { valor: (v) => menos(`${umaCasa.format(v)} h`), valorCompleto: (v) => menos(`${duasCasas.format(v)} h`) },
}

/** Mês da Gold (2025-07), ano/mês (2025/7), período (P1, 2025-07/2026-06) ou nome em maiúsculas. */
function formatarCategoria(categoria: string, eixo: GraficoIA['eixo']): string {
  if (eixo === 'tempo') {
    const anoMes = /^(\d{4})\/(\d{1,2})$/.exec(categoria)
    return formatarMes(anoMes ? `${anoMes[1]}-${anoMes[2].padStart(2, '0')}` : categoria)
  }
  if (eixo === 'periodo') return formatarPeriodo(categoria)
  // Códigos (ALM-REC-001, UC-0010) ficam como estão; nomes da Gold perdem as maiúsculas
  return /\d/.test(categoria) && categoria.includes('-') ? categoria : formatarNome(categoria)
}

export function formatosDoGrafico(grafico: GraficoIA): Formatos {
  const valores = (grafico.unidade && VALORES[grafico.unidade]) || {
    valor: compacto,
    valorCompleto: (v: number) => menos(duasCasas.format(v)),
  }
  return {
    ...valores,
    categoria: (c) => formatarCategoria(c, grafico.eixo),
    serie: (nome) => formatarNome(nome),
  }
}
