import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import ReceitaPage from './ReceitaPage'

// O mock só tem 3 itens por nível: aqui o drill-down informa 25, para a paginação aparecer.
// As linhas continuam as da página 1 do mock; só `page` e `total` mudam.
vi.mock('@/services', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services')>()
  return {
    ...original,
    buscarDashboard: async (
      params: Parameters<typeof original.buscarDashboard>[0],
      sinal?: AbortSignal,
    ) => {
      const dados = await original.buscarDashboard({ ...params, page: 1 }, sinal)
      return {
        ...dados,
        drill_down: { ...dados.drill_down, page: params.page ?? 1, page_size: 10, total: 25 },
      }
    },
  }
})

afterEach(cleanup)

describe('Onde o volume caiu?: trocar a visão ou a página não volta ao topo', () => {
  let rolar: MockInstance<typeof window.scrollTo>
  beforeEach(() => {
    rolar = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })
  afterEach(() => rolar.mockRestore())

  /** Roteador de dados, como o do app: só com ele o ScrollRestoration funciona. */
  const abrir = async (url: string) => {
    const router = createMemoryRouter(
      [
        {
          element: (
            <>
              <Outlet />
              <ScrollRestoration />
            </>
          ),
          children: [{ path: '/receita', element: <ReceitaPage /> }],
        },
      ],
      { initialEntries: [url] },
    )
    render(<RouterProvider router={router} />)
    const titulo = await screen.findByRole('heading', { name: 'Onde o volume caiu?' })
    const card = titulo.closest('section') as HTMLElement
    await within(card).findByRole('table')
    rolar.mockClear()
    return { card, busca: () => router.state.location.search }
  }
  const conteudo = (card: HTMLElement) => card.querySelector<HTMLElement>('[data-visao]')!

  it('Região → Classes troca o conteúdo no lugar e mantém os filtros, o foco e o card', async () => {
    const { card, busca } = await abrir('/receita?municipio=Recife')
    expect(within(card).getByRole('columnheader', { name: 'Bairro' })).toBeTruthy()
    const classes = within(card).getByRole('button', { name: 'Classes' })
    classes.focus()
    fireEvent.click(classes)
    // Enquanto carrega: o conteúdo antigo fica, esmaecido, com o aviso discreto
    expect(within(card).getByRole('status').textContent).toBe('Atualizando…')
    expect(card.getAttribute('aria-busy')).toBe('true')
    expect(within(card).getByRole('columnheader', { name: 'Bairro' })).toBeTruthy()

    expect(await within(card).findByRole('columnheader', { name: 'Classe' })).toBeTruthy()
    expect(rolar).not.toHaveBeenCalled()
    expect(card.isConnected).toBe(true) // o mesmo card, sem desmontar
    expect(busca()).toBe('?municipio=Recife&ver=classe') // o município continua
    expect(classes.getAttribute('aria-pressed')).toBe('true')
    expect(within(card).getByRole('button', { name: 'Região' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
    expect(document.activeElement).toBe(classes)
    expect(within(card).getByRole('status').textContent).toBe('')
  })

  it('o conteúdo novo entra pelo lado da troca, e a primeira carga não anima', async () => {
    const { card } = await abrir('/receita')
    expect(conteudo(card).className).not.toContain('animate-')

    fireEvent.click(within(card).getByRole('button', { name: 'Classes' }))
    await within(card).findByRole('columnheader', { name: 'Classe' })
    expect(conteudo(card).dataset.visao).toBe('classe')
    expect(conteudo(card).className).toContain('motion-safe:animate-entrada-direita')

    fireEvent.click(within(card).getByRole('button', { name: 'Região' }))
    await within(card).findByRole('columnheader', { name: 'Município' })
    expect(conteudo(card).dataset.visao).toBe('regiao')
    expect(conteudo(card).className).toContain('motion-safe:animate-entrada-esquerda')
    // Só o conteúdo da visão atual existe: nunca dois ao mesmo tempo
    expect(card.querySelectorAll('[data-visao]')).toHaveLength(1)
  })

  it('mudar de página não volta ao topo', async () => {
    const { card, busca } = await abrir('/receita')
    fireEvent.click(within(card).getByRole('button', { name: 'Próxima página' }))
    expect(
      await within(card).findByRole('button', { name: 'Página 2', current: 'page' }),
    ).toBeTruthy()
    expect(busca()).toBe('?page=2')
    expect(rolar).not.toHaveBeenCalled()
  })

  it('trocar de visão volta a paginação para a página 1, sem mexer nos outros filtros', async () => {
    const { card, busca } = await abrir('/receita?municipio=Recife&page=2')
    expect(within(card).getByRole('button', { name: 'Página 2', current: 'page' })).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Classes' }))
    await within(card).findByRole('columnheader', { name: 'Classe' })
    expect(busca()).toBe('?municipio=Recife&ver=classe')
    expect(within(card).getByRole('button', { name: 'Página 1', current: 'page' })).toBeTruthy()
    expect(rolar).not.toHaveBeenCalled()
  })

  it('o drill-down volta ao topo de propósito: ele muda a análise, a ponte e a explicação', async () => {
    const { card, busca } = await abrir('/receita')
    fireEvent.click(within(card).getByRole('cell', { name: 'Recife' }))
    await within(card).findByRole('columnheader', { name: 'Bairro' })
    expect(busca()).toBe('?municipio=Recife')
    expect(rolar).toHaveBeenCalledWith(0, 0)
  })
})
