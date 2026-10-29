/**
 * Data do contrato ("YYYY-MM-DD") → "28/06/2026". Não passa por `new Date()`: a data sem hora
 * seria lida como meia-noite UTC e, no fuso de Recife, viraria o dia anterior.
 */
export function formatarData(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : data
}

/**
 * Formata o instante da última carga da Gold ("gold_atualizada_em" no contrato da API).
 * Mesmo dia → "hoje, 06:15"; outro dia → "20/10, 06:15".
 */
export function formatarAtualizacao(valor: Date | string, agora: Date = new Date()): string {
  const data = typeof valor === 'string' ? new Date(valor) : valor
  if (Number.isNaN(data.getTime())) return '—'

  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (data.toDateString() === agora.toDateString()) return `hoje, ${hora}`

  const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${dia}, ${hora}`
}
