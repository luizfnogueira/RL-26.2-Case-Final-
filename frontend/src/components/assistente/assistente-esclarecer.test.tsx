import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import exemploBairro from '@/data/mocks/resposta_ia_esclarecer.json'
import exemploResposta from '@/data/mocks/resposta_ia.json'
import AppLayout from '@/layouts/AppLayout'
import { perguntarIA } from '@/services/ia'
import { responderPergunta } from '@/services/mock/ia'
import type { RespostaIA } from '@/types/ia'

// Pedir esclarecimento (contrato, seção 9): pergunta ambígua volta com opções clicáveis.
vi.mock('@/services/ia', () => ({ perguntarIA: vi.fn() }))
const perguntar = vi.mocked(perguntarIA)

afterEach(() => {
  cleanup()
  perguntar.mockReset()
})

const copia = (exemplo: unknown) => structuredClone(exemplo) as RespostaIA

function abrirPainel() {
  const router = createMemoryRouter(
    [{ element: <AppLayout />, children: [{ path: '/painel', element: <p>Painel</p> }] }],
    { initialEntries: ['/painel'] },
  )
  render(<RouterProvider router={router} />)
  fireEvent.click(screen.getByRole('button', { name: 'Pergunte à IA' }))
  return screen.getByRole('complementary', { name: 'Assistente V-Energy' })
}

async function enviar(painel: HTMLElement, pergunta: string) {
  fireEvent.change(within(painel).getByLabelText('Sua pergunta'), { target: { value: pergunta } })
  fireEvent.click(within(painel).getByRole('button', { name: 'Enviar' }))
  await vi.waitFor(() => expect(within(painel).queryByRole('status')).toBeNull())
}

describe('pedir esclarecimento', () => {
  it('mostra a pergunta e uma opção por município, mais "todos"', async () => {
    perguntar.mockResolvedValueOnce(copia(exemploBairro))
    const painel = abrirPainel()
    await enviar(painel, 'Qual a receita do Centro?')
    expect(within(painel).getByText('O bairro Centro existe em 3 municípios. De qual você quer saber?')).toBeTruthy()
    const opcoes = within(within(painel).getByRole('list', { name: 'Opções de esclarecimento' })).getAllByRole('button')
    expect(opcoes.map((b) => b.textContent)).toEqual([
      'Centro de Olinda',
      'Centro de Paulista',
      'Centro de Recife',
      'Todos os municípios juntos',
    ])
  })

  it('clicar numa opção reenvia a pergunta completa na mesma conversa', async () => {
    const esclarecer = { ...copia(exemploBairro), conversa_id: '8f14e45f-ceea-4b67-9c2a-5d3f1a2b6c7d' }
    perguntar.mockResolvedValueOnce(esclarecer).mockResolvedValueOnce(copia(exemploResposta))
    const painel = abrirPainel()
    await enviar(painel, 'Qual a receita do Centro?')
    fireEvent.click(within(painel).getByRole('button', { name: 'Centro de Recife' }))
    await vi.waitFor(() => expect(perguntar).toHaveBeenCalledTimes(2))
    expect(perguntar.mock.calls[1][0]).toBe('Qual a receita do Centro (bairro Centro, em Recife)?')
    expect(perguntar.mock.calls[1][2]).toBe(esclarecer.conversa_id)
    expect(within(painel).getByText('Qual a receita do Centro (bairro Centro, em Recife)?')).toBeTruthy()
  })
})

describe('mock do front', () => {
  it.each([
    ['Qual a receita do Centro?', 'esclarecer'],
    ['Qual a receita do Centro de Recife?', 'nao_sei'],
    ['Qual foi a receita deste ano?', 'esclarecer'],
    ['Qual foi a receita de 2026?', 'nao_sei'],
  ])('"%s" → %s', async (pergunta, status) => {
    expect((await responderPergunta({ pergunta })).status).toBe(status)
  })
})
