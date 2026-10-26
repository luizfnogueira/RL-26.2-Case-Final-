/** Números a exibir: primeira, última e a vizinhança da atual, com `null` onde há reticências. */
export function paginasVisiveis(atual: number, ultima: number): Array<number | null> {
  const conjunto = new Set([1, ultima, atual - 1, atual, atual + 1])
  const ordenadas = [...conjunto].filter((p) => p >= 1 && p <= ultima).sort((a, b) => a - b)
  const saida: Array<number | null> = []
  ordenadas.forEach((pagina, i) => {
    if (i > 0 && pagina - ordenadas[i - 1] > 1) saida.push(null)
    saida.push(pagina)
  })
  return saida
}
