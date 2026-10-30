import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { OpcoesFiltrosApi } from '@/types/filtros'
import { paraOpcoesBarra } from '@/utils/filtros'
import SeletorDeItens from './SeletorDeItens'
import { selecaoValida, type SelecaoItens } from './selecaoItens'

afterEach(cleanup)

// Mesmo formato e nomes de GET /filtros com a Gold: caixa alta, bairro repetido em municípios.
const RESPOSTA: OpcoesFiltrosApi = {
  municipios: ['JABOATÃO DOS GUARARAPES', 'OLINDA', 'PAULISTA', 'RECIFE', 'CAMARAGIBE'],
  bairros: [
    { municipio: 'OLINDA', bairro: 'CENTRO' },
    { municipio: 'RECIFE', bairro: 'BOA VISTA' },
    { municipio: 'RECIFE', bairro: 'CENTRO' },
  ],
  classes: ['COMERCIAL', 'RESIDENCIAL'],
  alimentadores: [{ alimentador: 'ALM-REC-001', municipio: 'RECIFE' }],
  metadados: { dados_ficticios: true, gold_atualizada_em: null, observacoes: [] },
}
const OPCOES = paraOpcoesBarra(RESPOSTA)

/** Renderiza com estado de verdade e expõe a última seleção. */
function montar(inicial: SelecaoItens) {
  const atual = { valor: inicial }
  function Teste() {
    const [valor, setValor] = useState(inicial)
    atual.valor = valor
    return <SeletorDeItens opcoes={OPCOES} valor={valor} aoMudar={setValor} />
  }
  render(<Teste />)
  return atual
}

const caixa = (nome: string) => screen.getByRole('checkbox', { name: nome })

describe('paraOpcoesBarra', () => {
  it('agrupa os bairros e alimentadores pelo município e mantém os nomes do banco', () => {
    expect(OPCOES.bairros).toEqual({ OLINDA: ['CENTRO'], RECIFE: ['BOA VISTA', 'CENTRO'] })
    expect(OPCOES.municipios).toContain('RECIFE')
    expect(OPCOES.alimentadores).toEqual({ RECIFE: ['ALM-REC-001'] })
  })
})

describe('SeletorDeItens', () => {
  it('mostra o nome formatado, mas guarda o valor exatamente como veio da API', () => {
    const atual = montar({ nivel: 'municipio', itens: [] })
    fireEvent.click(caixa('Recife'))
    expect(atual.valor.itens).toEqual(['RECIFE'])
  })

  it('pede o mínimo de 2 itens', () => {
    const atual = montar({ nivel: 'municipio', itens: [] })
    expect(screen.getByText(/Escolha mais 2 itens/)).toBeTruthy()
    fireEvent.click(caixa('Recife'))
    expect(screen.getByText(/Escolha mais 1 item/)).toBeTruthy()
    expect(selecaoValida(atual.valor)).toBe(false)
    fireEvent.click(caixa('Olinda'))
    expect(selecaoValida(atual.valor)).toBe(true)
  })

  it('trava em 4 itens: o quinto fica desabilitado até desmarcar um', () => {
    const atual = montar({ nivel: 'municipio', itens: [] })
    for (const nome of ['Recife', 'Olinda', 'Paulista', 'Camaragibe']) fireEvent.click(caixa(nome))
    expect(atual.valor.itens).toHaveLength(4)
    expect((caixa('Jaboatão dos Guararapes') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(caixa('Jaboatão dos Guararapes'))
    expect(atual.valor.itens).toHaveLength(4)

    fireEvent.click(caixa('Olinda'))
    expect((caixa('Jaboatão dos Guararapes') as HTMLInputElement).disabled).toBe(false)
  })

  it('no nível bairro, só lista os bairros do município escolhido', () => {
    const atual = montar({ nivel: 'bairro', itens: [] })
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText(/Escolha o município/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Município'), { target: { value: 'RECIFE' } })
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual([
      'Boa Vista',
      'Centro',
    ])
    fireEvent.click(caixa('Boa Vista'))
    fireEvent.click(caixa('Centro'))
    expect(atual.valor).toEqual({
      nivel: 'bairro',
      municipio: 'RECIFE',
      itens: ['BOA VISTA', 'CENTRO'],
    })
    expect(selecaoValida(atual.valor)).toBe(true)
  })

  it('trocar o nível ou o município zera os itens', () => {
    const atual = montar({ nivel: 'bairro', municipio: 'RECIFE', itens: ['BOA VISTA', 'CENTRO'] })
    fireEvent.change(screen.getByLabelText('Município'), { target: { value: 'OLINDA' } })
    expect(atual.valor.itens).toEqual([])

    fireEvent.change(screen.getByLabelText('Comparar por'), { target: { value: 'classe' } })
    expect(atual.valor).toEqual({ nivel: 'classe', itens: [] })
  })

  it('selecaoValida recusa repetição, mais de 4 e bairro sem município', () => {
    expect(selecaoValida({ nivel: 'classe', itens: ['A', 'A'] })).toBe(false)
    expect(selecaoValida({ nivel: 'classe', itens: ['A', 'B', 'C', 'D', 'E'] })).toBe(false)
    expect(selecaoValida({ nivel: 'bairro', itens: ['A', 'B'] })).toBe(false)
  })
})
