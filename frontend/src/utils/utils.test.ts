import { describe, expect, it } from 'vitest'
import { formatarAtualizacao, formatarData, formatarDataHora, formatarDuracao } from './datas'

describe('datas e durações da Visão 360', () => {
  it('formatarData não passa por fuso', () => {
    expect(formatarData('2018-03-12')).toBe('12/03/2018')
  })

  it('formatarDataHora mostra a hora de Recife, qualquer que seja o fuso da máquina', () => {
    expect(formatarDataHora('2026-06-14T19:20:00-03:00')).toBe('14/06/2026, 19:20')
    expect(formatarDataHora('2026-06-14T22:20:00Z')).toBe('14/06/2026, 19:20')
    expect(formatarDataHora('nada')).toBe('—')
  })

  it('formatarDuracao em minutos e horas', () => {
    expect(formatarDuracao(45)).toBe('45 min')
    expect(formatarDuracao(120)).toBe('2 h')
    expect(formatarDuracao(105)).toBe('1 h 45 min')
  })
})
import { paraOpcoesBarra } from './filtros'
import {
  duracaoEmMeses,
  formatarMes,
  formatarPeriodo,
  limitesDoPeriodo,
  mesNoPeriodo,
  mesesRecentes,
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

  it('lista meses recentes do mais novo para o mais antigo', () => {
    expect(mesesRecentes(3, new Date(2026, 0, 15))).toEqual(['2026-01', '2025-12', '2025-11'])
    expect(mesesRecentes(2, new Date(2026, 9, 28))).toEqual(['2026-10', '2026-09'])
  })
})

describe('paraOpcoesBarra', () => {
  it('agrupa bairros e alimentadores pelo município sem alterar os valores da Gold', () => {
    const opcoes = paraOpcoesBarra({
      municipios: ['OLINDA', 'RECIFE'],
      bairros: [
        { municipio: 'OLINDA', bairro: 'CENTRO' },
        { municipio: 'RECIFE', bairro: 'BOA VISTA' },
        { municipio: 'RECIFE', bairro: 'CENTRO' },
      ],
      classes: ['RESIDENCIAL'],
      alimentadores: [
        { alimentador: 'ALM-OLI-001', municipio: 'OLINDA' },
        { alimentador: 'ALM-REC-001', municipio: 'RECIFE' },
      ],
      metadados: { dados_ficticios: false, gold_atualizada_em: null, observacoes: [] },
    })

    expect(opcoes.bairros).toEqual({
      OLINDA: ['CENTRO'],
      RECIFE: ['BOA VISTA', 'CENTRO'],
    })
    expect(opcoes.alimentadores).toEqual({
      OLINDA: ['ALM-OLI-001'],
      RECIFE: ['ALM-REC-001'],
    })
    expect(opcoes.municipios).toEqual(['OLINDA', 'RECIFE'])
  })

  it('devolve objeto vazio enquanto a consulta não carregou', () => {
    expect(paraOpcoesBarra(null)).toEqual({})
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
