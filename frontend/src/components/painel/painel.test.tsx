import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import fixture from '@/data/mocks/dashboard.json'
import type { Dashboard, PontoSerie } from '@/types/dashboard'
import HistoricoExecutivo from './HistoricoExecutivo'
import IndicadoresExecutivos from './IndicadoresExecutivos'
import { caminhoMensal, escalaMensal } from './historico'
import { leituraDoPeriodo } from './indicadores'

afterEach(cleanup)
const exemplo = () => structuredClone(fixture) as Dashboard

describe('apresentação dos indicadores', () => {
  it('trata redução de continuidade como favorável e aumento do valor em aberto como desfavorável', () => {
    render(<IndicadoresExecutivos indicadores={exemplo().indicadores} />)
    const dec = within(screen.getByRole('region', { name: 'DEC médio' })).getByTitle(
      'Variação percentual em relação à comparação',
    )
    const aberto = within(screen.getByRole('region', { name: 'Valor em aberto' })).getByTitle(
      'Variação percentual em relação à comparação',
    )
    expect(dec.className).toContain('bg-sucesso-suave')
    expect(dec.textContent).toContain('−13,6%')
    expect(aberto.className).toContain('bg-perigo-suave')
    expect(aberto.textContent).toContain('+27,9%')
  })

  it('a leitura não afirma crescimento quando a variação é zero ou ausente', () => {
    const { indicadores } = exemplo()
    indicadores.receita_faturada.variacao_percentual.valor = 0
    expect(leituraDoPeriodo(indicadores)).toContain('receita faturada ficou estável')
    indicadores.energia_faturada.variacao_percentual.valor = null
    expect(leituraDoPeriodo(indicadores)).toBe(
      'Consulte a evolução mensal e o diagnóstico para explorar este recorte.',
    )
  })
})

describe('histórico executivo', () => {
  it('cada unidade tem uma escala independente e a base positiva começa em zero', () => {
    const reais = escalaMensal([0, 1000])
    const kwh = escalaMensal([0, 100])
    expect(reais.marcas[0]).toBe(0)
    expect(kwh.marcas[0]).toBe(0)
    expect(reais.y(1000)).toBeCloseTo(kwh.y(100))
    expect(reais.marcas.at(-1)).not.toBe(kwh.marcas.at(-1))
    expect(Number.isFinite(escalaMensal([0, null]).y(0))).toBe(true)
  })

  it('interrompe a linha em uma ausência, preservando o zero como ponto', () => {
    const pontos = exemplo().serie_historica.slice(0, 3)
    pontos[0].receita.valor = 0
    pontos[1].receita.valor = null
    const caminho = caminhoMensal(pontos, 'receita', escalaMensal([0, 100]).y)
    expect(caminho.match(/M/g)).toHaveLength(2)
    expect(caminho).not.toContain('L')
    expect(caminho).toContain('M88.00,246.00')
  })

  it('exibe ausência na tabela sem substituir por zero', () => {
    const pontos: PontoSerie[] = exemplo().serie_historica.slice(0, 1)
    pontos[0].receita.valor = null
    render(<HistoricoExecutivo pontos={pontos} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    expect(within(screen.getByRole('table')).getByRole('cell', { name: '—' })).toBeTruthy()
  })

  it('exibe vazio quando nenhuma série possui valores', () => {
    render(<HistoricoExecutivo pontos={[]} />)
    expect(screen.getByText('Histórico indisponível')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
