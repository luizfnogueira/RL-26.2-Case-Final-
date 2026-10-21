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
