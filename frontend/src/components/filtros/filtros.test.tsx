import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import type { CampoFiltro, FiltrosUrl, OpcoesFiltros } from '@/types/filtros'
import BarraDeFiltros from './BarraDeFiltros'

afterEach(cleanup)

const ATUAL = '2025-07/2026-06'
const COMPARACAO = '2022-07/2023-06'
const CAMPOS: readonly CampoFiltro[] = [
  'periodo_atual',
  'periodo_comparacao',
  'municipio',
  'bairro',
  'classe',
]
const PADROES: FiltrosUrl = { periodo_atual: ATUAL, periodo_comparacao: COMPARACAO }
const OPCOES: OpcoesFiltros = {
  municipios: ['Recife', 'Jaboatão dos Guararapes', 'Olinda'],
  bairros: {
    Recife: ['Boa Viagem', 'Boa Vista', 'Casa Amarela'],
    'Jaboatão dos Guararapes': ['Candeias', 'Piedade'],
    Olinda: ['Casa Caiada', 'Rio Doce'],
  },
  classes: ['Comercial', 'Industrial', 'Residencial'],
  alimentadores: ['ALM-DEMO-001', 'ALM-DEMO-002', 'ALM-DEMO-003', 'ALM-DEMO-004', 'ALM-DEMO-005'],
}

const emUrl = (url: string) =>
  function Roteador({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  }

function usarFiltros(url: string) {
  return renderHook(() => ({ ...useFiltrosUrl(CAMPOS, PADROES), local: useLocation() }), {
    wrapper: emUrl(url),
  })
}

const buscaAtual = (local: { search: string }) => new URLSearchParams(local.search)

describe('useFiltrosUrl', () => {
  it('usa os padrões quando a URL está vazia e lê os valores da URL', () => {
    expect(usarFiltros('/receita').result.current.filtros).toEqual(PADROES)
    const { result } = usarFiltros('/receita?municipio=Recife&classe=Industrial&page=3')
    expect(result.current.filtros).toEqual({
      ...PADROES,
      municipio: 'Recife',
      classe: 'Industrial',
    })
  })

  it('ignora período inválido e bairro sem município', () => {
    const { result } = usarFiltros('/receita?periodo_atual=2026-13&bairro=Boa%20Vista')
    expect(result.current.filtros).toEqual(PADROES)
  })

  it('só lê os campos pedidos', () => {
    const { result } = usarFiltros('/receita?alimentador=ALM-DEMO-001&municipio=Olinda')
    expect(result.current.filtros.alimentador).toBeUndefined()
    expect(result.current.filtros.municipio).toBe('Olinda')
  })

  it('definir grava na URL, remove valor vazio e volta à página 1', () => {
    const { result } = usarFiltros('/receita?page=4&classe=Industrial')
    act(() => result.current.definir({ municipio: 'Recife', classe: '' }))
    const busca = buscaAtual(result.current.local)
    expect(busca.get('municipio')).toBe('Recife')
    expect(busca.has('classe')).toBe(false)
    expect(busca.has('page')).toBe(false)
  })

  it('trocar o município limpa o bairro e o alimentador, mas escolher os dois juntos mantém ambos', () => {
    const { result } = usarFiltros(
      '/receita?municipio=Recife&bairro=Boa%20Vista&alimentador=ALM-REC-001',
    )
    act(() => result.current.definir({ municipio: 'Olinda' }))
    expect(buscaAtual(result.current.local).has('bairro')).toBe(false)
    expect(buscaAtual(result.current.local).has('alimentador')).toBe(false)

    act(() => result.current.definir({ municipio: 'Recife', bairro: 'Boa Vista' }))
    expect(result.current.filtros).toMatchObject({ municipio: 'Recife', bairro: 'Boa Vista' })

    act(() => result.current.definir({ municipio: '' }))
    expect(result.current.filtros.bairro).toBeUndefined()
  })

  it('limpar volta aos padrões e alterados acompanha a diferença', () => {
    const { result } = usarFiltros('/receita?municipio=Recife&outro=1')
    expect(result.current.alterados).toBe(true)
    act(() => result.current.limpar())
    expect(result.current.filtros).toEqual(PADROES)
    expect(result.current.alterados).toBe(false)
    expect(buscaAtual(result.current.local).get('outro')).toBe('1')
  })

  it('mantém a identidade de `filtros` enquanto nada muda', () => {
    const { result, rerender } = usarFiltros('/receita?municipio=Recife')
    const antes = result.current.filtros
    rerender()
    expect(result.current.filtros).toBe(antes)
  })
})

function Sonda({ aoLer }: { aoLer: (busca: string) => void }) {
  aoLer(useLocation().search)
  return null
}

describe('BarraDeFiltros', () => {
  const renderizar = (
    url: string,
    campos: readonly CampoFiltro[] = CAMPOS,
    opcoes = OPCOES,
  ) => {
    let busca = ''
    const resultado = render(
      <MemoryRouter initialEntries={[url]}>
        <BarraDeFiltros campos={campos} padroes={PADROES} opcoes={opcoes} />
        <Sonda aoLer={(b) => (busca = b)} />
      </MemoryRouter>,
    )
    return { ...resultado, busca: () => busca }
  }

  const lista = (nome: string) => screen.getByLabelText(nome) as HTMLSelectElement

  it('mostra só os filtros recebidos por prop', () => {
    renderizar('/receita', ['municipio', 'classe'])
    expect(screen.getByLabelText('Município')).toBeTruthy()
    expect(screen.getByLabelText('Classe')).toBeTruthy()
    expect(screen.queryByLabelText('Período atual')).toBeNull()
    expect(screen.queryByLabelText('Bairro')).toBeNull()
    expect(screen.queryByLabelText('Alimentador')).toBeNull()
  })

  it('guarda a escolha na URL e a recupera depois de recarregar a página', () => {
    const primeira = renderizar('/receita')
    fireEvent.change(lista('Município'), { target: { value: 'Recife' } })
    fireEvent.change(lista('Bairro'), { target: { value: 'Boa Vista' } })
    fireEvent.change(lista('Classe'), { target: { value: 'Residencial' } })
    const url = `/receita${primeira.busca()}`
    expect(url).toContain('municipio=Recife')
    primeira.unmount()

    renderizar(url) // "recarregar": uma árvore nova partindo só da URL
    expect(lista('Município').value).toBe('Recife')
    expect(lista('Bairro').value).toBe('Boa Vista')
    expect(lista('Classe').value).toBe('Residencial')
  })

  it('bairro só habilita com município e lista os bairros daquele município', () => {
    renderizar('/receita')
    expect(lista('Bairro').disabled).toBe(true)
    fireEvent.change(lista('Município'), { target: { value: 'Olinda' } })
    expect(lista('Bairro').disabled).toBe(false)
    const opcoes = [...lista('Bairro').options].map((o) => o.textContent)
    expect(opcoes).toEqual(['Todos', 'Casa Caiada', 'Rio Doce'])
  })

  it('alimentador mostra todos sem município e só os do município escolhido', () => {
    renderizar('/receita', ['municipio', 'alimentador'], {
      municipios: ['RECIFE', 'OLINDA'],
      alimentadores: {
        RECIFE: ['ALM-REC-001', 'ALM-REC-002'],
        OLINDA: ['ALM-OLI-001'],
      },
    })

    const opcoesTodos = [...lista('Alimentador').options].map((o) => o.value)
    expect(opcoesTodos).toEqual(['', 'ALM-REC-001', 'ALM-REC-002', 'ALM-OLI-001'])

    fireEvent.change(lista('Município'), { target: { value: 'RECIFE' } })
    const opcoesRecife = [...lista('Alimentador').options].map((o) => o.value)
    expect(opcoesRecife).toEqual(['', 'ALM-REC-001', 'ALM-REC-002'])
  })

  it('não deixa escolher o mesmo período nos dois filtros', () => {
    renderizar('/receita')
    const noAtual = [...lista('Período atual').options]
    expect(noAtual.find((o) => o.value === COMPARACAO)?.disabled).toBe(true)
    expect(noAtual.find((o) => o.value === ATUAL)?.disabled).toBe(false)
    const naComparacao = [...lista('Comparar com').options]
    expect(naComparacao.find((o) => o.value === ATUAL)?.disabled).toBe(true)
    expect(lista('Período atual').value).toBe(ATUAL)
  })

  it('"Limpar filtros" só aparece com filtro ativo e restaura os padrões', () => {
    renderizar('/receita')
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
    fireEvent.change(lista('Classe'), { target: { value: 'Industrial' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(lista('Classe').value).toBe('')
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })
})
