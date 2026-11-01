import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import fixture from '@/data/mocks/comparacao.json'
import type { Comparacao } from '@/types/dashboard'
import TabelaComparacao from './TabelaComparacao'
import { pioresDaLinha } from './comparacao'

afterEach(cleanup)
const exemplo = () => structuredClone(fixture) as Comparacao
const linha = (nome: string) =>
  within(screen.getByRole('table')).getByRole('heading', { name: nome }).closest('tr')!

describe('critérios documentados de C3', () => {
  it('usa o valor atual nos indicadores e a maior queda percentual no consumo', () => {
    const { itens } = exemplo()
    itens[0].receita_media_uc.atual.valor = 10
    itens[1].receita_media_uc.atual.valor = 20
    itens[0].consumo_medio_uc.atual.valor = 1
    itens[1].consumo_medio_uc.atual.valor = 100
    itens[0].consumo_medio_uc.variacao_percentual.valor = -1
    itens[1].consumo_medio_uc.variacao_percentual.valor = -20
    itens[0].valor_em_aberto_pct.atual.valor = 4
    itens[1].valor_em_aberto_pct.atual.valor = 5
    itens[0].dec.atual.valor = 8
    itens[1].dec.atual.valor = 2
    itens[0].fec.atual.valor = 1
    itens[1].fec.atual.valor = 3
    expect(pioresDaLinha(itens, 'ucs_ativas')).toEqual([])
    expect(pioresDaLinha(itens, 'receita_media_uc')).toEqual(['RECIFE'])
    expect(pioresDaLinha(itens, 'consumo_medio_uc')).toEqual(['OLINDA'])
    expect(pioresDaLinha(itens, 'valor_em_aberto_pct')).toEqual(['OLINDA'])
    expect(pioresDaLinha(itens, 'dec')).toEqual(['RECIFE'])
    expect(pioresDaLinha(itens, 'fec')).toEqual(['OLINDA'])
  })

  it('não classifica aumento de consumo como queda nem compara um único valor disponível', () => {
    const { itens } = exemplo()
    itens[0].consumo_medio_uc.variacao_percentual.valor = 1
    itens[1].consumo_medio_uc.variacao_percentual.valor = 2
    expect(pioresDaLinha(itens, 'consumo_medio_uc')).toEqual([])
    itens[0].dec.atual.valor = null
    expect(pioresDaLinha(itens, 'dec')).toEqual([])
  })

  it('identifica todos os empates, sem escolher arbitrariamente o primeiro recorte', () => {
    const dados = exemplo()
    for (const item of dados.itens) item.fec.atual.valor = 0
    expect(pioresDaLinha(dados.itens, 'fec')).toEqual(['RECIFE', 'OLINDA'])
    render(<TabelaComparacao dados={dados} />)
    expect(within(linha('FEC')).getAllByText('Pior valor (empate)')).toHaveLength(2)
    expect(within(linha('UCs ativas')).queryByText(/Pior valor/)).toBeNull()
  })
})

describe('tabela de comparação', () => {
  it('mostra valores e variações da API e diferencia pontos percentuais de variação relativa', () => {
    const dados = exemplo()
    const aberto = dados.itens[0].valor_em_aberto_pct
    aberto.atual.valor = 9.64
    aberto.comparacao.valor = 6.09
    aberto.diferenca.valor = 3.55
    // A tabela deve apresentar o resultado contratado, sem recomputar a divisão.
    aberto.variacao_percentual.valor = 12.3456
    render(<TabelaComparacao dados={dados} />)
    const tabela = screen.getByRole('table', {
      name: 'Comparação dos seis indicadores por recorte',
    })
    expect(within(tabela).getAllByRole('row')).toHaveLength(7)
    const celula = within(linha('Valor em aberto')).getAllByRole('cell')[1]
    expect(celula.textContent).toContain('9,64%')
    expect(celula.textContent).toContain('Comparação: 6,09%')
    expect(celula.textContent).toContain('Diferença: +3,55 p.p.')
    expect(celula.textContent).toContain('Variação relativa: +12,3456%')
    expect(within(linha('Receita por UC')).getAllByRole('cell')[1].textContent).toContain('R$')
    expect(screen.getByText(/A receita inclui tributos/)).toBeTruthy()
  })

  it('destaca o pior valor com texto e ícone, sem depender só da cor', () => {
    const dados = exemplo()
    dados.itens[0].dec.atual.valor = 8
    dados.itens[1].dec.atual.valor = 2
    render(<TabelaComparacao dados={dados} />)
    const celulas = within(linha('DEC')).getAllByRole('cell')
    const destaque = within(celulas[1]).getByText('Pior valor')
    expect(destaque.querySelector('svg')).toBeTruthy()
    expect(within(celulas[2]).queryByText('Pior valor')).toBeNull()
  })

  it('explica DEC/FEC ausentes abaixo de município e preserva zeros de UCs', () => {
    const dados = exemplo()
    dados.filtros.nivel = 'bairro'
    for (const item of dados.itens) {
      item.ucs_ativas.atual.valor = 0
      for (const campo of ['dec', 'fec'] as const) {
        for (const parte of ['atual', 'comparacao', 'diferenca', 'variacao_percentual'] as const)
          item[campo][parte].valor = null
      }
    }
    render(<TabelaComparacao dados={dados} />)
    expect(
      within(linha('DEC')).getAllByTitle(/DEC e FEC não são disponibilizados/).length,
    ).toBeGreaterThan(0)
    expect(within(linha('DEC')).queryByText('Pior valor')).toBeNull()
    expect(within(linha('UCs ativas')).getAllByText('0')).toHaveLength(2)
    expect(screen.getByText(/DEC e FEC ficam ausentes em bairros e classes/)).toBeTruthy()
  })

  it('explica base de comparação zero sem exibir um percentual inventado', () => {
    const dados = exemplo()
    dados.itens[0].receita_media_uc.comparacao.valor = 0
    dados.itens[0].receita_media_uc.variacao_percentual.valor = null
    render(<TabelaComparacao dados={dados} />)
    expect(
      within(linha('Receita por UC')).getByTitle(
        'A base de comparação é zero; a variação percentual não é definida.',
      ),
    ).toBeTruthy()
  })
})
