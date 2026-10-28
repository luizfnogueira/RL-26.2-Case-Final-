import type { CelulaIA, DadosIA } from '@/types/ia'

/** CSV para planilha em pt-BR: ";" entre colunas, vírgula decimal e BOM para o Excel abrir em UTF-8. */
export function paraCsv({ colunas, linhas }: DadosIA): string {
  const campo = (valor: CelulaIA) => {
    const texto =
      valor === null
        ? ''
        : typeof valor === 'number'
          ? String(valor).replace('.', ',')
          : String(valor)
    return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }
  return (
    String.fromCharCode(0xfeff) +
    [colunas, ...linhas].map((linha) => linha.map(campo).join(';')).join('\n')
  )
}

/** Exportar CSV da resposta em tabela (GENAI-15.4): o arquivo fica só no computador de quem baixou. */
export function baixarCsv(dados: DadosIA) {
  const url = URL.createObjectURL(new Blob([paraCsv(dados)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'resposta-assistente.csv'
  link.click()
  URL.revokeObjectURL(url)
}
