import { describe, expect, it } from 'vitest'
import { formatarAtualizacao } from './datas'
import {
  duracaoEmMeses,
  formatarMes,
  formatarPeriodo,
  limitesDoPeriodo,
  mesNoPeriodo,
  periodoValido,
} from './periodos'

describe('periodos', () => {
  it('lê início e fim, inclusive de um mês isolado', () => {
    expect(limitesDoPeriodo('2025-07/2026-06')).toEqual({ inicio: '2025-07', fim: '2026-06' })
    expect(limitesDoPeriodo('2026-06')).toEqual({ inicio: '2026-06', fim: '2026-06' })
    expect(limitesDoPeriodo('2025-13')).toBeNull()
    expect(limitesDoPeriodo('lixo')).toBeNull()
  })

  it('calcula a duração e valida início ≤ fim', () => {
    expect(duracaoEmMeses('2025-07/2026-06')).toBe(12)
    expect(duracaoEmMeses('2022-07/2023-06')).toBe(12)
    expect(duracaoEmMeses('2026-06')).toBe(1)
    expect(periodoValido('2026-06/2025-07')).toBe(false)
    expect(periodoValido('2025-07/2026-06')).toBe(true)
  })

  it('formata para exibição', () => {
    expect(formatarPeriodo('2025-07/2026-06')).toBe('Jul/2025 – Jun/2026')
    expect(formatarPeriodo('2026-06')).toBe('Jun/2026')
    expect(formatarMes('2022-01')).toBe('Jan/2022')
    expect(formatarPeriodo('invalido')).toBe('invalido')
  })

  it('confere se um mês está na janela, com extremos inclusivos', () => {
    expect(mesNoPeriodo('2025-07', '2025-07/2026-06')).toBe(true)
    expect(mesNoPeriodo('2026-06', '2025-07/2026-06')).toBe(true)
    expect(mesNoPeriodo('2026-07', '2025-07/2026-06')).toBe(false)
  })
})

describe('formatarAtualizacao', () => {
  const agora = new Date(2026, 9, 21, 15, 0)

  it('usa "hoje" no mesmo dia e a data nos demais', () => {
    expect(formatarAtualizacao(new Date(2026, 9, 21, 6, 15), agora)).toBe('hoje, 06:15')
    expect(formatarAtualizacao(new Date(2026, 9, 20, 6, 15), agora)).toBe('20/10, 06:15')
  })

  it('aceita ISO 8601 e devolve travessão para datas inválidas', () => {
    expect(formatarAtualizacao(new Date(2026, 9, 21, 9, 5).toISOString(), agora)).toBe(
      'hoje, 09:05',
    )
    expect(formatarAtualizacao('nada', agora)).toBe('—')
  })
})
