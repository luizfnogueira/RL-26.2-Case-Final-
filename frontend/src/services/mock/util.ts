import type { FiltrosRegiao, Indicador, Pagina } from '@/types/comum'
import { ApiError } from '../erro-api'

/** Únicas janelas com números simulados (mesmas do stub do backend). */
export const PERIODO_ATUAL = '2025-07/2026-06'
export const PERIODO_COMPARACAO = '2022-07/2023-06'

export const CAMPOS_REGIAO = ['municipio', 'bairro', 'classe', 'alimentador'] as const

export type Registro = Record<string, unknown>

export function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T
}

export function erroApi(
  status: number,
  codigo: string,
  mensagem: string,
  detalhes?: Record<string, unknown>,
): ApiError {
  return new ApiError(status, codigo, mensagem, detalhes)
}

export function arredondar(valor: number, casas = 2): number {
  const fator = 10 ** casas
  return Math.round(valor * fator) / fator
}

export function indicador(valor: number | null, unidade: string, periodo: string): Indicador {
  return { valor, unidade, periodo_referencia: periodo }
}

/** Consultas válidas fora das janelas simuladas retornam 422, como o stub do backend. */
export function verificarCenario(periodoAtual?: string | null, periodoComparacao?: string | null) {
  const foraAtual = periodoAtual != null && periodoAtual !== PERIODO_ATUAL
  const foraComparacao = periodoComparacao != null && periodoComparacao !== PERIODO_COMPARACAO
  if (foraAtual || foraComparacao) {
    throw erroApi(
      422,
      'CENARIO_STUB_INDISPONIVEL',
      `O mock só simula periodo_atual=${PERIODO_ATUAL} e periodo_comparacao=${PERIODO_COMPARACAO}.`,
    )
  }
}

/**
 * Filtros geográficos por AND; `cadastro` completa a região de itens que só têm id_uc.
 * Compara sem diferenciar maiúsculas/minúsculas, como o backend: o `GET /filtros` pode
 * devolver `RECIFE` (Gold real) enquanto o fixture usa `Recife`.
 */
export function filtrarRegiao<T extends object>(
  items: T[],
  filtros: FiltrosRegiao,
  cadastro?: Record<string, Registro>,
): T[] {
  return items.filter((item) =>
    CAMPOS_REGIAO.every((campo) => {
      const alvo = filtros[campo]
      if (alvo === undefined || alvo === null || alvo === '') return true
      const registro = item as Registro
      const valor =
        campo in registro ? registro[campo] : cadastro?.[String(registro.id_uc)]?.[campo]
      return (
        typeof valor === 'string' &&
        valor.toLocaleLowerCase('pt-BR') === alvo.toLocaleLowerCase('pt-BR')
      )
    }),
  )
}

export function paginar<T>(items: T[], page: number, pageSize: number): Pagina<T> {
  const inicio = (page - 1) * pageSize
  return {
    items: items.slice(inicio, inicio + pageSize),
    page,
    page_size: pageSize,
    total: items.length,
  }
}

/** Instante atual em ISO 8601 com o fuso local (ex.: 2026-10-21T09:30:00-03:00). */
export function agoraIso(): string {
  const d = new Date()
  const dois = (n: number) => String(n).padStart(2, '0')
  const deslocamento = -d.getTimezoneOffset()
  const sinal = deslocamento >= 0 ? '+' : '-'
  const abs = Math.abs(deslocamento)
  return (
    `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}` +
    `T${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}` +
    `${sinal}${dois(Math.floor(abs / 60))}:${dois(abs % 60)}`
  )
}

/** Atraso artificial (VITE_MOCK_DELAY_MS) para exercitar os estados de carregamento. */
export function atrasar(sinal?: AbortSignal): Promise<void> {
  const configurado = Number(import.meta.env.VITE_MOCK_DELAY_MS ?? 350)
  const ms = Number.isFinite(configurado) && configurado > 0 ? configurado : 0
  const cancelado = () => new DOMException('Requisição cancelada', 'AbortError')

  return new Promise((resolver, rejeitar) => {
    if (sinal?.aborted) return rejeitar(cancelado())
    const tempo = setTimeout(resolver, ms)
    sinal?.addEventListener(
      'abort',
      () => {
        clearTimeout(tempo)
        rejeitar(cancelado())
      },
      { once: true },
    )
  })
}
