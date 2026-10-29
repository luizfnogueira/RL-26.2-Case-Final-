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

// Uma linha só, com variação menor que isso, pode cortar o zero para mostrar a tendência
const VARIACAO_PEQUENA = 0.15

/** Escala do eixo: do zero (ou de um piso "redondo") ao teto, em 4 intervalos iguais. */
export function escalaDasLinhas(valores: number[], series: number): number[] {
  const minimo = Math.min(...valores)
  const maximo = Math.max(...valores)
  const cortaZero = series === 1 && minimo > 0 && (maximo - minimo) / maximo < VARIACAO_PEQUENA
  const piso = cortaZero ? minimo : Math.min(0, minimo)
  // Passo "redondo" (1, 2, 2,5 ou 5 × potência de dez), para as marcas caírem em 22, 23, 24 mi
  const passo = tetoDoEixo(Math.max(maximo - piso, 1e-9) / 4)
  const inicio = Math.floor(piso / passo) * passo
  const fim = Math.max(Math.ceil(maximo / passo) * passo, inicio + passo)
  return Array.from({ length: Math.round((fim - inicio) / passo) + 1 }, (_, i) => inicio + i * passo)
}

/** Ângulos de cada fatia, no sentido horário a partir do topo (12 h). */
export function angulosDasFatias(valores: number[], total: number) {
  let acumulado = -Math.PI / 2
  return valores.map((valor, i) => {
    const de = acumulado
    acumulado += (valor / total) * Math.PI * 2
    return { i, valor, de, ate: acumulado, meio: (de + acumulado) / 2 }
  })
}
