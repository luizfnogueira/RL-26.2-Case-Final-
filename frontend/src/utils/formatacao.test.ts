import { describe, expect, it } from 'vitest'
import {
  formatarCep,
  formatarEnergia,
  formatarIndicador,
  formatarNome,
  formatarPercentual,
  formatarReais,
  formatarReaisCompleto,
} from './formatacao'

describe('formatarReais', () => {
  it('compacta em mil, mi e bi com vírgula decimal', () => {
    expect(formatarReais(205937500)).toBe('R$ 205,9 mi')
    expect(formatarReais(8171291.05)).toBe('R$ 8,2 mi')
    expect(formatarReais(631200)).toBe('R$ 631,2 mil')
    expect(formatarReais(1_250_000_000)).toBe('R$ 1,3 bi')
    expect(formatarReais(120)).toBe('R$ 120,00')
  })

  it('usa o sinal de menos tipográfico e só põe "+" quando pedido', () => {
    expect(formatarReais(24655666, { sinal: true })).toBe('+R$ 24,7 mi')
    expect(formatarReais(-8171291, { sinal: true })).toBe('−R$ 8,2 mi')
    expect(formatarReais(-8171291)).toBe('−R$ 8,2 mi')
    expect(formatarReais(0, { sinal: true })).toBe('R$ 0,00')
  })

  it('formata o valor completo sem espaço especial', () => {
    expect(formatarReaisCompleto(222421875)).toBe('R$ 222.421.875,00')
    expect(formatarReaisCompleto(-8171291.05)).toBe('−R$ 8.171.291,05')
  })
})

describe('formatarEnergia e formatarPercentual', () => {
  it('escolhe GWh, MWh ou kWh pela grandeza', () => {
    expect(formatarEnergia(19_800_000)).toBe('19,8 GWh')
    expect(formatarEnergia(-10_755_649, { sinal: true })).toBe('−10,8 GWh')
    expect(formatarEnergia(4_500)).toBe('4,5 MWh')
    expect(formatarEnergia(820)).toBe('820 kWh')
  })

  it('formata percentuais com uma casa e sinal opcional', () => {
    expect(formatarPercentual(12.3861)).toBe('12,4%')
    expect(formatarPercentual(8.0, { sinal: true })).toBe('+8,0%')
    expect(formatarPercentual(-3.8986)).toBe('−3,9%')
  })
})

describe('formatarNome', () => {
  it('ajusta só o rótulo de nomes em maiúsculas, como a Gold guarda', () => {
    expect(formatarNome('RECIFE')).toBe('Recife')
    expect(formatarNome('BOA VISTA')).toBe('Boa Vista')
    expect(formatarNome('JABOATÃO DOS GUARARAPES')).toBe('Jaboatão dos Guararapes')
    expect(formatarNome('ÁGUA FRIA')).toBe('Água Fria')
  })

  it('não mexe em nomes que já estão em caixa mista nem em textos sem letras', () => {
    expect(formatarNome('Recife')).toBe('Recife')
    expect(formatarNome('Jaboatão dos Guararapes')).toBe('Jaboatão dos Guararapes')
    expect(formatarNome('123')).toBe('123')
  })
})

describe('formatarIndicador', () => {
  it('formata pela unidade e nunca transforma ausência em zero', () => {
    expect(formatarIndicador({ valor: 222421875, unidade: 'BRL' })).toBe('R$ 222,4 mi')
    expect(formatarIndicador({ valor: -3.8986, unidade: '%' })).toBe('−3,9%')
    expect(formatarIndicador({ valor: 1_500_000, unidade: 'kWh' })).toBe('1,5 GWh')
    expect(formatarIndicador({ valor: 48, unidade: 'UCs' })).toBe('48 UCs')
    expect(formatarIndicador({ valor: null, unidade: 'BRL' })).toBe('—')
  })
})

describe('formatarCep', () => {
  it('põe o hífen nos 8 dígitos da Gold e não estraga o que já vem mascarado ou fora do padrão', () => {
    expect(formatarCep('50050000')).toBe('50050-000')
    expect(formatarCep('50050-000')).toBe('50050-000')
    expect(formatarCep('5005')).toBe('5005')
  })
})
