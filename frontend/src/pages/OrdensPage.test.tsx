import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import inspecoesFixture from '@/data/mocks/inspecoes.json'
import {
  cancelarInspecao,
  concluirInspecao,
  iniciarCampo,
  listarInspecoes,
} from '@/services'
import type { Ordens, ParamsInspecoes } from '@/types/inspecoes'
import OrdensPage from './OrdensPage'

const mocks = vi.hoisted(() => ({
  listarInspecoes: vi.fn(),
  iniciarCampo: vi.fn(),
  concluirInspecao: vi.fn(),
  cancelarInspecao: vi.fn(),
  normalizarErro: vi.fn((e: unknown) => ({
    status: 400,
    codigo: 'ERRO',
    mensagem: e instanceof Error ? e.message : 'Erro na operação',
  })),
}))

vi.mock('@/services', () => mocks)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('OrdensPage', () => {
  it('renderiza a lista de ordens e os contadores de status', async () => {
    const fixture = inspecoesFixture as unknown as Ordens
    vi.mocked(listarInspecoes).mockResolvedValue(fixture)

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    // Aguarda carregar dados
    expect(await screen.findByText('UC-DEMO-002')).toBeTruthy()
    expect(screen.getByText('UC-DEMO-005')).toBeTruthy()
    expect(screen.getByText('UC-DEMO-003')).toBeTruthy()
    expect(screen.getByText('UC-DEMO-004')).toBeTruthy()

    // Verifica botão link de retorno para a Fila
    expect(screen.getByRole('link', { name: /Fila de inspeção/i })).toBeTruthy()

    // Verifica abas com contagens
    expect(screen.getByRole('button', { name: /Todas/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Aberta/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Em campo/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Concluída/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cancelada/i })).toBeTruthy()
  })

  it('mostra um botão de ações centralizado por ordem e abre as opções disponíveis', async () => {
    const fixture = inspecoesFixture as unknown as Ordens
    vi.mocked(listarInspecoes).mockResolvedValue(fixture)

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    await screen.findByText('UC-DEMO-002')

    const botoesAcoes = screen.getAllByRole('button', { name: /Ações da ordem/i })
    expect(botoesAcoes).toHaveLength(fixture.items.length)
    expect(botoesAcoes[0].getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(botoesAcoes[0])

    expect(botoesAcoes[0].getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Iniciar campo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar ordem' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver detalhes' })).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Iniciar campo' }), { key: 'Escape' })
    expect(botoesAcoes[0].getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(botoesAcoes[0])
  })

  it('permite filtrar por status através das abas', async () => {
    const fixture = inspecoesFixture as unknown as Ordens
    vi.mocked(listarInspecoes).mockImplementation(async (params: ParamsInspecoes = {}) => {
      if (params.status === 'EM_CAMPO') {
        return {
          ...fixture,
          items: fixture.items.filter((o) => o.status === 'EM_CAMPO'),
          total: 1,
        }
      }
      return fixture
    })

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    await screen.findByText('UC-DEMO-002')

    // Clica na aba "Em campo"
    const abaEmCampo = screen.getByRole('button', { name: /Em campo/i })
    fireEvent.click(abaEmCampo)

    await waitFor(() => {
      expect(listarInspecoes).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EM_CAMPO' }),
        expect.anything(),
      )
    })
  })

  it('abre modal e despacha ordem para campo', async () => {
    const fixture = inspecoesFixture as unknown as Ordens
    vi.mocked(listarInspecoes).mockResolvedValue(fixture)
    vi.mocked(iniciarCampo).mockResolvedValue({
      ...fixture.items[0],
      status: 'EM_CAMPO',
    })

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    await screen.findByText('UC-DEMO-002')

    // Ordem #1 está ABERTA, possui botão "Iniciar campo"
    fireEvent.click(screen.getByRole('button', { name: 'Ações da ordem #1' }))
    const botaoIniciar = screen.getByRole('button', { name: /Iniciar campo/i })
    fireEvent.click(botaoIniciar)

    // Modal aberto
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Iniciar vistoria em campo · Ordem #1/i)).toBeTruthy()

    // Confirma envio
    const botaoConfirmar = screen.getByRole('button', { name: /Despachar equipe/i })
    await act(async () => {
      fireEvent.click(botaoConfirmar)
    })

    expect(iniciarCampo).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        equipe_responsavel: expect.any(String),
      }),
    )
  })

  it('abre modal e conclui ordem registrando laudo', async () => {
    const fixture = inspecoesFixture as unknown as Ordens
    vi.mocked(listarInspecoes).mockResolvedValue(fixture)
    vi.mocked(concluirInspecao).mockResolvedValue({
      ...fixture.items[1],
      status: 'CONCLUIDA',
    })

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    await screen.findByText('UC-DEMO-005')

    // Ordem #2 está EM_CAMPO, possui botão "Registrar resultado"
    fireEvent.click(screen.getByRole('button', { name: 'Ações da ordem #2' }))
    const botaoRegistrar = screen.getByRole('button', { name: /Registrar resultado/i })
    fireEvent.click(botaoRegistrar)

    // Modal aberto
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Registrar resultado em campo · Ordem #2/i)).toBeTruthy()

    // Preenche observações (obrigatório)
    const inputObs = screen.getByLabelText(/Observações e laudo técnico/i)
    fireEvent.change(inputObs, { target: { value: 'Fraude confirmada e eliminada' } })

    const botaoConfirmar = screen.getByRole('button', { name: /Concluir vistoria/i })
    await act(async () => {
      fireEvent.click(botaoConfirmar)
    })

    expect(concluirInspecao).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        irregularidade_detectada: true,
        observacoes: 'Fraude confirmada e eliminada',
      }),
    )
  })

  it('abre modal e cancela ordem com justificativa', async () => {
    const fixture = inspecoesFixture as unknown as Ordens
    vi.mocked(listarInspecoes).mockResolvedValue(fixture)
    vi.mocked(cancelarInspecao).mockResolvedValue({
      ...fixture.items[0],
      status: 'CANCELADA',
    })

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    await screen.findByText('UC-DEMO-002')

    // Clica no primeiro botão "Cancelar"
    fireEvent.click(screen.getByRole('button', { name: 'Ações da ordem #1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar ordem' }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Cancelar ordem de inspeção #1/i)).toBeTruthy()

    // Preenche justificativa
    const inputJustificativa = screen.getByLabelText(/Justificativa do cancelamento/i)
    fireEvent.change(inputJustificativa, { target: { value: 'Consumidor mudou de endereço' } })

    const botaoConfirmar = screen.getByRole('button', { name: /Confirmar cancelamento/i })
    await act(async () => {
      fireEvent.click(botaoConfirmar)
    })

    expect(cancelarInspecao).toHaveBeenCalledWith(1, 'Consumidor mudou de endereço')
  })

  it('abre modal de detalhes com histórico da ordem', async () => {
    const fixture = inspecoesFixture as unknown as Ordens
    vi.mocked(listarInspecoes).mockResolvedValue(fixture)

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    await screen.findByText('UC-DEMO-003')

    // Abre as ações da Ordem #3 e seleciona os detalhes
    fireEvent.click(screen.getByRole('button', { name: 'Ações da ordem #3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Ordem de inspeção #3/i)).toBeTruthy()
    expect(screen.getByText(/Resultado da vistoria técnica/i)).toBeTruthy()
    expect(screen.getByText(/Histórico de alterações/i)).toBeTruthy()
  })
})
