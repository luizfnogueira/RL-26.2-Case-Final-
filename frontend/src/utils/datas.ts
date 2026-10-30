/**
 * Data do contrato ("YYYY-MM-DD") → "28/06/2026". Não passa por `new Date()`: a data sem hora
 * seria lida como meia-noite UTC e, no fuso de Recife, viraria o dia anterior.
 */
export function formatarData(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : data
}

const DATA_HORA_RECIFE = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Recife',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Horário de negócio da API (ex.: "2026-06-14T19:20:00-03:00") → "14/06/2026, 19:20", sempre no
 * fuso de Recife, para a tela mostrar a mesma hora em qualquer máquina.
 */
export function formatarDataHora(instante: string): string {
  const data = new Date(instante)
  return Number.isNaN(data.getTime()) ? '—' : DATA_HORA_RECIFE.format(data)
}

/** Minutos → "45 min", "2 h" ou "1 h 45 min". */
export function formatarDuracao(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const resto = Math.round(minutos % 60)
  if (horas === 0) return `${resto} min`
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
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
