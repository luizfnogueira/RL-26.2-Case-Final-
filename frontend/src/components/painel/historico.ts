import type { PontoSerie } from '@/types/dashboard'

export const AREA = { esquerda: 88, direita: 912, topo: 28, base: 246, largura: 1000, altura: 282 }

export function escalaMensal(valores: readonly (number | null)[]) {
  const presentes = valores.filter((v): v is number => v !== null)
  const minimo = Math.min(0, ...presentes)
  const maximo = Math.max(0, ...presentes)
  const amplitude = maximo - minimo || 1
  const teto = maximo + amplitude * 0.1
  return {
    y: (valor: number) =>
      AREA.base - ((valor - minimo) / (teto - minimo)) * (AREA.base - AREA.topo),
    marcas: Array.from({ length: 5 }, (_, i) => minimo + ((teto - minimo) * i) / 4),
  }
}

export function posicaoMes(indice: number, total: number) {
  return AREA.esquerda + ((AREA.direita - AREA.esquerda) * indice) / Math.max(1, total - 1)
}

/** Um valor ausente interrompe a linha, sem inventar zero ou interpolar a lacuna. */
export function caminhoMensal(
  pontos: readonly PontoSerie[],
  campo: 'receita' | 'energia',
  y: (v: number) => number,
) {
  let novoTrecho = true
  return pontos
    .map((p, i) => {
      const valor = p[campo].valor
      if (valor === null) {
        novoTrecho = true
        return ''
      }
      const comando = novoTrecho ? 'M' : 'L'
      novoTrecho = false
      return `${comando}${posicaoMes(i, pontos.length).toFixed(2)},${y(valor).toFixed(2)}`
    })
    .join(' ')
}
