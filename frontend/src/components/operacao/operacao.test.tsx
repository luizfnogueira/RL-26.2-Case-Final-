import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PontoOperacao } from '@/types/operacao'
import HistoricoOperacao from './HistoricoOperacao'
import { caminhoContinuidade, numeroOperacao } from './formatacao'

afterEach(cleanup)

function ponto(mes: string, valor: number | null): PontoOperacao {
  const indicador = { valor, unidade: 'h/UC', periodo_referencia: mes }
  return {
    mes,
    dec: indicador,
    fec: indicador,
    dec_sem_dia_critico: indicador,
    fec_sem_dia_critico: indicador,
  }
}

describe('Histórico operacional', () => {
  it('interrompe a curva em meses ausentes e mantém zero e quatro casas', () => {
    expect(
      caminhoContinuidade(
        [0, 1, null, 3, 4],
        (i) => i,
        (v) => v,
      ),
    ).toBe('M0.00,0.00 L1.00,1.00  M3.00,3.00 L4.00,4.00')
    expect(numeroOperacao(null)).toBe('—')
    expect(numeroOperacao(0)).toBe('0')
    expect(numeroOperacao(0.0123)).toBe('0,0123')
  })

  it('exibe mês único centralizado, sem coordenadas inválidas e com tabela acessível', () => {
    render(
      <HistoricoOperacao
        serie={{ alimentador: 'ALM-1', pontos: [ponto('2026-06', 0)] }}
        indicador="dec"
        aoMudarIndicador={vi.fn()}
      />,
    )
    const grafico = screen.getByRole('img', { name: /Evolução mensal de DEC/ })
    expect(grafico.innerHTML).not.toMatch(/NaN|Infinity/)
    expect(grafico.querySelector('circle')?.getAttribute('cx')).toBe('500')
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    const tabela = screen.getByRole('table', { name: 'Histórico de DEC de ALM-1' })
    expect(within(tabela).getByRole('rowheader', { name: 'Jun/2026' })).toBeTruthy()
    expect(within(tabela).getAllByText('0')).toHaveLength(2)
  })

  it.each([{ pontos: [] }, { pontos: [ponto('2026-06', null)] }])(
    'não desenha uma curva artificial sem valores (%j)',
    ({ pontos }) => {
      render(
        <HistoricoOperacao
          serie={{ alimentador: 'ALM-1', pontos }}
          indicador="fec"
          aoMudarIndicador={vi.fn()}
        />,
      )
      expect(screen.getByText('Histórico indisponível')).toBeTruthy()
      expect(screen.queryByRole('img')).toBeNull()
    },
  )
})
