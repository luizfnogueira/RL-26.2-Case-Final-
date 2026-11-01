import type { IndicadorNomeado } from '@/types/comum'
import { formatarIndicador } from '@/utils/formatacao'

const duasCasas = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const ateDuasCasas = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/**
 * Número do resumo como ele aparece no texto (texto_unidade.py do back), para a lista e o texto nunca
 * divergirem: R$ com 2 casas, kWh por extenso com até 2 casas e % inteiro (o meio arredonda para cima,
 * como no veredito). Os valores chegam sem sinal; a direção está no rótulo.
 */
export function formatarNumeroResumo(numero: Pick<IndicadorNomeado, 'valor' | 'unidade'>): string {
  const { valor, unidade } = numero
  if (valor === null) return '—'
  switch (unidade) {
    case 'BRL':
      return `R$ ${duasCasas.format(Math.abs(valor))}`
    case 'kWh':
      return `${ateDuasCasas.format(Math.abs(valor))} kWh`
    case '%':
      return `${Math.floor(Math.abs(valor) + 0.5)}%`
    default:
      return formatarIndicador(numero)
  }
}
