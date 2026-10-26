/** Uma etapa da cascata: um total (parte do zero) ou uma variação (flutua sobre o acumulado). */
export interface EtapaCascata {
  id: string
  rotulo: string
  valor: number
  tipo: 'total' | 'variacao'
}

export interface BarraCascata {
  etapa: EtapaCascata
  /** Início e fim no eixo de valores, já ordenados (de ≤ ate). */
  de: number
  ate: number
  /** Acumulado depois desta etapa (linha de ligação com a próxima). */
  acumulado: number
}

/** Posiciona as barras: totais saem do zero; variações partem do acumulado anterior. */
export function calcularBarras(etapas: readonly EtapaCascata[]): BarraCascata[] {
  let acumulado = 0
  return etapas.map((etapa) => {
    if (etapa.tipo === 'total') {
      acumulado = etapa.valor
      return { etapa, de: Math.min(0, etapa.valor), ate: Math.max(0, etapa.valor), acumulado }
    }
    const inicio = acumulado
    acumulado += etapa.valor
    return {
      etapa,
      de: Math.min(inicio, acumulado),
      ate: Math.max(inicio, acumulado),
      acumulado,
    }
  })
}

/** Teto "redondo" para o eixo: 1, 2, 2,5, 5 ou 10 vezes uma potência de dez. */
export function tetoDoEixo(maximo: number): number {
  if (maximo <= 0) return 1
  const potencia = 10 ** Math.floor(Math.log10(maximo))
  for (const passo of [1, 2, 2.5, 5, 10]) {
    if (passo * potencia >= maximo) return passo * potencia
  }
  return 10 * potencia
}

/** Marcas do eixo, do zero ao teto, em quantidade `n` de intervalos. */
export function marcasDoEixo(teto: number, n = 4): number[] {
  return Array.from({ length: n + 1 }, (_, i) => (teto / n) * i)
}

/** Quebra o rótulo em linhas de até `max` caracteres, sem cortar palavras. */
export function quebrarRotulo(rotulo: string, max = 14): string[] {
  const linhas: string[] = []
  let atual = ''
  for (const palavra of rotulo.split(' ')) {
    if (atual && `${atual} ${palavra}`.length > max) {
      linhas.push(atual)
      atual = palavra
    } else {
      atual = atual ? `${atual} ${palavra}` : palavra
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}
