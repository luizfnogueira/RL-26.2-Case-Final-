import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import {
  construirUrlComparacao,
  extrairItens,
  useComparacaoUrl,
} from './useComparacaoUrl'

afterEach(cleanup)

const emUrl = (url: string) =>
  function Roteador({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  }

function usarComparacao(url: string) {
  return renderHook(() => ({ ...useComparacaoUrl(), local: useLocation() }), {
    wrapper: emUrl(url),
  })
}

describe('extrairItens', () => {
  it('extrai itens repetidos na URL (itens=A&itens=B)', () => {
    const params = new URLSearchParams('itens=RECIFE&itens=OLINDA')
    expect(extrairItens(params)).toEqual(['RECIFE', 'OLINDA'])
  })

  it('extrai itens separados por vírgula e remove duplicatas', () => {
    const params = new URLSearchParams('itens=RECIFE,OLINDA&itens=RECIFE')
    expect(extrairItens(params)).toEqual(['RECIFE', 'OLINDA'])
  })

  it('retorna lista vazia sem itens', () => {
    const params = new URLSearchParams('nivel=municipio')
    expect(extrairItens(params)).toEqual([])
  })
})

describe('construirUrlComparacao', () => {
  it('constrói a URL para a aba de comparação com múltiplos itens repetidos', () => {
    const url = construirUrlComparacao({
      periodo_atual: '2025-07/2026-06',
      periodo_comparacao: '2022-07/2023-06',
      nivel: 'municipio',
      itens: ['RECIFE', 'OLINDA'],
    })
    expect(url).toBe(
      '/painel?aba=comparar&periodo_atual=2025-07%2F2026-06&periodo_comparacao=2022-07%2F2023-06&nivel=municipio&itens=RECIFE&itens=OLINDA',
    )
  })

  it('inclui município como filtro pai no nível bairro', () => {
    const url = construirUrlComparacao({
      nivel: 'bairro',
      municipio: 'RECIFE',
      itens: ['BOA VISTA', 'BOA VIAGEM'],
    })
    expect(url).toContain('nivel=bairro')
    expect(url).toContain('municipio=RECIFE')
    expect(url).toContain('itens=BOA+VISTA&itens=BOA+VIAGEM')
  })
})

describe('useComparacaoUrl', () => {
  it('usa valores padrão quando a URL não possui parâmetros', () => {
    const { result } = usarComparacao('/painel')
    expect(result.current.filtros.periodo_atual).toBe('2025-07/2026-06')
    expect(result.current.filtros.periodo_comparacao).toBe('2022-07/2023-06')
    expect(result.current.filtros.nivel).toBe('municipio')
    expect(result.current.filtros.itens).toEqual([])
    expect(result.current.estaAtiva).toBe(false)
  })

  it('lê estado na URL com vários itens, permitindo compartilhar ou recarregar sem perda', () => {
    const { result } = usarComparacao(
      '/painel?aba=comparar&nivel=municipio&itens=RECIFE&itens=OLINDA&periodo_atual=2025-07/2026-06&periodo_comparacao=2022-07/2023-06',
    )
    expect(result.current.estaAtiva).toBe(true)
    expect(result.current.filtros.aba).toBe('comparar')
    expect(result.current.filtros.nivel).toBe('municipio')
    expect(result.current.filtros.itens).toEqual(['RECIFE', 'OLINDA'])
    expect(result.current.filtros.periodo_atual).toBe('2025-07/2026-06')
    expect(result.current.filtros.periodo_comparacao).toBe('2022-07/2023-06')
  })

  it('permite atualizar os itens preservando o formato repetido na URL', () => {
    const { result } = usarComparacao('/painel?aba=comparar')
    act(() => {
      result.current.definir({
        nivel: 'municipio',
        itens: ['RECIFE', 'OLINDA', 'PAULISTA'],
      })
    })

    const search = result.current.local.search
    expect(search).toContain('itens=RECIFE')
    expect(search).toContain('itens=OLINDA')
    expect(search).toContain('itens=PAULISTA')
    expect(result.current.filtros.itens).toEqual(['RECIFE', 'OLINDA', 'PAULISTA'])
  })

  it('limpar remove parâmetros de comparação da URL', () => {
    const { result } = usarComparacao('/painel?aba=comparar&nivel=municipio&itens=RECIFE&itens=OLINDA')
    act(() => {
      result.current.limpar()
    })
    expect(result.current.local.search).toBe('')
    expect(result.current.estaAtiva).toBe(false)
  })
})

