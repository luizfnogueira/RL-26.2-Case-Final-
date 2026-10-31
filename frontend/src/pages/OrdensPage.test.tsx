import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import indicadoresFixture from '@/data/mocks/indicadores_ordens.json'
import inspecoesFixture from '@/data/mocks/inspecoes.json'
import unidadesFixture from '@/data/mocks/unidades.json'
import {
  buscarFiltros,
  buscarIndicadoresOrdens,
  cancelarInspecao,
  concluirInspecao,
  iniciarCampo,
  listarInspecoes,
} from '@/services'
import type { OpcoesFiltrosApi } from '@/types/filtros'
import type { IndicadoresOrdens, Ordens, ParamsInspecoes } from '@/types/inspecoes'
import OrdensPage from './OrdensPage'

const mocks = vi.hoisted(() => ({
  buscarFiltros: vi.fn(),
  listarInspecoes: vi.fn(),
  buscarIndicadoresOrdens: vi.fn(),
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

function opcoesDoCadastro(): OpcoesFiltrosApi {
  const cadastro = unidadesFixture
  return {
    municipios: [...new Set(cadastro.items.map((uc) => uc.municipio))],
    bairros: [
      ...new Map(
        cadastro.items.map((uc) => [
          `${uc.municipio}|${uc.bairro}`,
          { municipio: uc.municipio, bairro: uc.bairro },
        ]),
      ).values(),
    ],
    classes: [...new Set(cadastro.items.map((uc) => uc.classe))],
    alimentadores: [
      ...new Map(
        cadastro.items.map((uc) => [
          uc.alimentador,
          { alimentador: uc.alimentador, municipio: uc.municipio },
        ]),
      ).values(),
    ],
    metadados: cadastro.metadados,
  }
}

beforeEach(() => {
  vi.mocked(buscarFiltros).mockResolvedValue(opcoesDoCadastro())
  vi.mocked(buscarIndicadoresOrdens).mockResolvedValue(indicadoresFixture as IndicadoresOrdens)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('OrdensPage', () => {
  it('mostra a taxa de acerto, a energia recuperada e o acerto por motivo', async () => {
    vi.mocked(listarInspecoes).mockResolvedValue(inspecoesFixture as unknown as Ordens)

    render(
      <MemoryRouter initialEntries={['/perdas/ordens?municipio=Recife']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Resultado das inspeções')).toBeTruthy()
    expect(await screen.findByText('75,0%')).toBeTruthy()
    expect(screen.getByText('3 de 4 encontraram irregularidade')).toBeTruthy()
    expect(screen.getByText('1,5 MWh')).toBeTruthy()
    expect(screen.getByText('a fila estimava 1,8 MWh')).toBeTruthy()
    expect(screen.getByText('Histórico de religação')).toBeTruthy()
    expect(buscarIndicadoresOrdens).toHaveBeenCalledWith(
      expect.objectContaining({ municipio: 'Recife' }),
      expect.anything(),
    )
  })

  it('sem inspeções concluídas, explica que a taxa ainda não existe', async () => {
    vi.mocked(listarInspecoes).mockResolvedValue(inspecoesFixture as unknown as Ordens)
    vi.mocked(buscarIndicadoresOrdens).mockResolvedValue({
      ...(indicadoresFixture as IndicadoresOrdens),
      concluidas: 0,
      com_irregularidade: 0,
      taxa_acerto_pct: null,
      kwh_recuperado: 0,
      kwh_estimado: 0,
      por_motivo: [],
    })

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Nenhuma inspeção concluída')).toBeTruthy()
  })

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

  it('envia à API o período de criação e o alimentador escolhidos', async () => {
    const fixture = inspecoesFixture as unknown as Ordens
    vi.mocked(listarInspecoes).mockResolvedValue(fixture)

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    await screen.findByText('UC-DEMO-002')
    const seletorPeriodo = screen.getByRole('combobox', {
      name: 'Período atual',
    }) as HTMLSelectElement
    // As opções são meses de criação (o mês corrente e os 11 anteriores), não as janelas
    // analíticas do dashboard: o valor é lido da própria lista para o teste não depender do relógio.
    const mesCriacao = [...seletorPeriodo.options].map((opcao) => opcao.value).find(Boolean) ?? ''
    expect(mesCriacao).not.toBe('')
    fireEvent.change(seletorPeriodo, {
      target: { value: mesCriacao },
    })

    await waitFor(() =>
      expect(listarInspecoes).toHaveBeenLastCalledWith(
        expect.objectContaining({ periodo_atual: mesCriacao }),
        expect.anything(),
      ),
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Município' }), {
      target: { value: 'RECIFE' },
    })
    fireEvent.change(await screen.findByRole('combobox', { name: 'Alimentador' }), {
      target: { value: 'ALM-DEMO-001' },
    })

    await waitFor(() =>
      expect(listarInspecoes).toHaveBeenLastCalledWith(
        expect.objectContaining({
          periodo_atual: mesCriacao,
          municipio: 'RECIFE',
          alimentador: 'ALM-DEMO-001',
        }),
        expect.anything(),
      ),
    )
  })

  it('mantém no filtro um período vindo de link antigo, mesmo fora dos últimos 12 meses', async () => {
    vi.mocked(listarInspecoes).mockResolvedValue(inspecoesFixture as unknown as Ordens)

    render(
      <MemoryRouter initialEntries={['/perdas/ordens?periodo_atual=2025-07%2F2026-06']}>
        <OrdensPage />
      </MemoryRouter>,
    )

    const seletor = (await screen.findByRole('combobox', {
      name: 'Período atual',
    })) as HTMLSelectElement
    expect(seletor.value).toBe('2025-07/2026-06')
    await waitFor(() =>
      expect(listarInspecoes).toHaveBeenLastCalledWith(
        expect.objectContaining({ periodo_atual: '2025-07/2026-06' }),
        expect.anything(),
      ),
    )
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

    // Abre sem resposta marcada: nada de tipo nem kWh antes da escolha, e o botão bloqueado
    const botaoConfirmar = screen.getByRole('button', { name: /Concluir vistoria/i })
    expect((botaoConfirmar as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByLabelText(/Tipo de irregularidade/i)).toBeNull()
    expect(
      screen
        .getByRole('button', { name: /Irregularidade confirmada/i })
        .getAttribute('aria-pressed'),
    ).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: /Irregularidade confirmada/i }))
    expect((screen.getByLabelText(/Tipo de irregularidade/i) as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText(/Energia recuperada/i) as HTMLInputElement).value).toBe('')
    fireEvent.change(screen.getByLabelText(/Tipo de irregularidade/i), {
      target: { value: 'BY-PASS' },
    })
    fireEvent.change(screen.getByLabelText(/Energia recuperada/i), { target: { value: '150' } })
    fireEvent.change(screen.getByLabelText(/Observações e laudo técnico/i), {
      target: { value: 'Fraude confirmada e eliminada' },
    })

    await act(async () => {
      fireEvent.click(botaoConfirmar)
    })

    expect(concluirInspecao).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        irregularidade_detectada: true,
        tipo_irregularidade: 'BY-PASS',
        kwh_recuperado: 150,
        observacoes: 'Fraude confirmada e eliminada',
      }),
    )
  })

  it('conclui sem irregularidade com 0 kWh', async () => {
    const fixture = inspecoesFixture as unknown as Ordens
    vi.mocked(listarInspecoes).mockResolvedValue(fixture)
    vi.mocked(concluirInspecao).mockResolvedValue({ ...fixture.items[1], status: 'CONCLUIDA' })

    render(
      <MemoryRouter initialEntries={['/perdas/ordens']}>
        <OrdensPage />
      </MemoryRouter>,
    )
    await screen.findByText('UC-DEMO-005')
    fireEvent.click(screen.getByRole('button', { name: 'Ações da ordem #2' }))
    fireEvent.click(screen.getByRole('button', { name: /Registrar resultado/i }))
    await screen.findByRole('dialog')

    fireEvent.click(screen.getByRole('button', { name: /Sem irregularidade/i }))
    fireEvent.change(screen.getByLabelText(/Observações e laudo técnico/i), {
      target: { value: 'Instalação regular' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Concluir vistoria/i }))
    })

    expect(concluirInspecao).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        irregularidade_detectada: false,
        tipo_irregularidade: null,
        kwh_recuperado: 0,
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
