import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import resposta from '@/data/mocks/resposta_ia.json'
import AppLayout from '@/layouts/AppLayout'
import { ApiError } from '@/services/erro-api'
import { perguntarIA } from '@/services/ia'
import type { RespostaIA } from '@/types/ia'

// A API real fora do ar: o POST /ia é substituído só neste arquivo.
vi.mock('@/services/ia', () => ({ perguntarIA: vi.fn() }))
const perguntar = vi.mocked(perguntarIA)

afterEach(() => {
  cleanup()
  perguntar.mockReset()
})

function abrirPainel() {
  const router = createMemoryRouter(
    [{ element: <AppLayout />, children: [{ path: '/painel', element: <p>Painel</p> }] }],
    { initialEntries: ['/painel'] },
  )
  render(<RouterProvider router={router} />)
  fireEvent.click(screen.getByRole('button', { name: 'Pergunte à IA' }))
  return screen.getByRole('complementary', { name: 'Assistente V-Energy' })
}

describe('Tela 7 — erro e indisponibilidade', () => {
  it('agente indisponível (503) mostra a mensagem da API e tenta de novo', async () => {
    perguntar
      .mockRejectedValueOnce(
        new ApiError(
          503,
          'AGENTE_INDISPONIVEL',
          'O assistente está indisponível no momento. Tente novamente em alguns instantes.',
        ),
      )
      .mockResolvedValueOnce(resposta as RespostaIA)
    const painel = abrirPainel()
    fireEvent.click(within(painel).getByRole('button', { name: 'Qual foi a receita no período?' }))

    expect(
      await within(painel).findByText(/indisponível no momento \(AGENTE_INDISPONIVEL\)/),
    ).toBeTruthy()
    expect(within(painel).getByText(/Sua pergunta foi mantida/)).toBeTruthy()

    fireEvent.click(within(painel).getByRole('button', { name: 'Tentar novamente' }))
    expect(await within(painel).findByRole('button', { name: 'Como cheguei nisso' })).toBeTruthy()
    expect(within(painel).queryByText(/AGENTE_INDISPONIVEL/)).toBeNull()
    expect(perguntar).toHaveBeenCalledTimes(2)
    expect(perguntar.mock.calls[1][0]).toBe('Qual foi a receita no período?')
  })

  it('sem conexão com a API mostra aviso próprio', async () => {
    perguntar.mockRejectedValueOnce(new ApiError(0, 'REDE_INDISPONIVEL', 'Failed to fetch'))
    const painel = abrirPainel()
    fireEvent.click(
      within(painel).getByRole('button', { name: 'Por que a conta de luz aumentou?' }),
    )
    expect(
      await within(painel).findByText(/falar com o servidor \(REDE_INDISPONIVEL\)/),
    ).toBeTruthy()
  })

  it('manda só a pergunta para o POST /ia na primeira vez', async () => {
    perguntar.mockResolvedValueOnce(resposta as RespostaIA)
    const painel = abrirPainel()
    fireEvent.change(within(painel).getByLabelText('Sua pergunta'), {
      target: { value: '  Qual foi a receita no período?  ' },
    })
    fireEvent.click(within(painel).getByRole('button', { name: 'Enviar' }))
    await within(painel).findByRole('button', { name: 'Como cheguei nisso' })
    expect(perguntar).toHaveBeenCalledWith(
      'Qual foi a receita no período?',
      expect.any(AbortSignal),
      null,
    )
  })

  it('reenvia o conversa_id da resposta e esquece ao limpar a conversa (GENAI-12)', async () => {
    const primeira = { ...(resposta as RespostaIA), conversa_id: 'id-da-conversa' }
    perguntar.mockResolvedValue(primeira)
    const painel = abrirPainel()
    const enviar = async (texto: string) => {
      fireEvent.change(within(painel).getByLabelText('Sua pergunta'), {
        target: { value: texto },
      })
      fireEvent.click(within(painel).getByRole('button', { name: 'Enviar' }))
      await vi.waitFor(() => expect(within(painel).queryByRole('status')).toBeNull())
    }

    await enviar('Qual foi a receita no período?')
    await enviar('E só comercial?')
    expect(perguntar.mock.calls[0][2]).toBeNull()
    expect(perguntar.mock.calls[1][2]).toBe('id-da-conversa')

    fireEvent.click(within(painel).getByRole('button', { name: 'Limpar conversa' }))
    await enviar('Qual foi a receita no período?')
    expect(perguntar.mock.calls[2][2]).toBeNull()
  })
})
