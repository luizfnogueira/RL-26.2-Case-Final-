import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import respostaReal from '@/data/mocks/resposta_insight_unidade_real.json'
import unidadeFixture from '@/data/mocks/unidade.json'
import unidadeRecenteFixture from '@/data/mocks/unidade_recente.json'
import { buscarUnidade, gerarInsight } from '@/services'
import { ApiError } from '@/services/erro-api'
import type { RespostaInsight } from '@/types/ia'
import type { Unidade360 } from '@/types/unidades'
import DetalheUnidade from './DetalheUnidade'
import { formatarNumeroResumo } from './numerosResumo'
import ResumoUnidadeIA from './ResumoUnidadeIA'

// Respostas e erros controlados: o serviço é substituído só neste arquivo.
const mocks = vi.hoisted(() => ({ buscarUnidade: vi.fn(), gerarInsight: vi.fn() }))
vi.mock('@/services', () => mocks)

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const PERIODO = '2025-07/2026-06'
// Texto por regra do modo real (fictício, UC-DEMO-001): termina com a observação "Texto alternativo:"
const ALTERNATIVO = respostaReal as RespostaInsight
const DA_IA: RespostaInsight = {
  ...ALTERNATIVO,
  texto:
    'O valor da conta de jun/2026 foi de R$ 486,00, 42% acima de jun/2025, que foi de R$ 342,70. ' +
    'O consumo subiu 38%, de 298 kWh para 412 kWh. Verifique a fatura em aberto de R$ 486,00.',
  metadados: { ...ALTERNATIVO.metadados, observacoes: [ALTERNATIVO.metadados.observacoes[0]] },
}

function adiada<T>() {
  let resolver!: (valor: T) => void
  let rejeitar!: (erro: unknown) => void
  const promessa = new Promise<T>((ok, falha) => {
    resolver = ok
    rejeitar = falha
  })
  return { promessa, resolver, rejeitar }
}

const card = () => screen.getByRole('region', { name: 'Resumo da conta' })
const botaoGerar = () => within(card()).getByRole('button', { name: /Gerar resumo|Gerando/ })
const abrirCard = (idUc = 'UC-DEMO-001') =>
  render(<ResumoUnidadeIA idUc={idUc} periodo={PERIODO} />)

async function gerarCom(resposta: RespostaInsight) {
  vi.mocked(gerarInsight).mockResolvedValue(resposta)
  abrirCard()
  fireEvent.click(botaoGerar())
  await within(card()).findByRole('heading', { name: resposta.titulo })
}

describe('resumo da conta na Visão 360', () => {
  it('não chama nada ao abrir a UC: começa com o botão e a explicação', async () => {
    vi.mocked(buscarUnidade).mockResolvedValue(unidadeFixture as Unidade360)
    render(
      <MemoryRouter>
        <DetalheUnidade id="UC-DEMO-001" />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('region', { name: 'Resumo da conta' })).toBeTruthy()
    expect(botaoGerar().textContent).toContain('Gerar resumo')
    expect(within(card()).getByText(/usando só os números já calculados nesta tela/)).toBeTruthy()
    expect(gerarInsight).not.toHaveBeenCalled()
  })

  it('envia a UC e o mesmo período da página', async () => {
    vi.mocked(buscarUnidade).mockResolvedValue(unidadeFixture as Unidade360)
    vi.mocked(gerarInsight).mockResolvedValue(ALTERNATIVO)
    render(
      <MemoryRouter>
        <DetalheUnidade id="UC-DEMO-001" />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar resumo' }))
    await waitFor(() => expect(gerarInsight).toHaveBeenCalledTimes(1))
    expect(vi.mocked(gerarInsight).mock.calls[0][0]).toEqual({
      contexto: 'unidade',
      id_uc: 'UC-DEMO-001',
      filtros: { periodo_atual: unidadeFixture.periodo_referencia },
    })
  })

  it('durante o carregamento o botão fica desabilitado e a mensagem aparece na região viva', async () => {
    const pedido = adiada<RespostaInsight>()
    vi.mocked(gerarInsight).mockReturnValue(pedido.promessa)
    abrirCard()
    fireEvent.click(botaoGerar())
    const botao = botaoGerar() as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    expect(botao.getAttribute('aria-busy')).toBe('true')
    expect(botao.textContent).toContain('Gerando…')
    const viva = card().querySelector('[aria-live="polite"]') as HTMLElement
    expect(within(viva).getByText('Gerando resumo, pode levar alguns segundos.')).toBeTruthy()
    fireEvent.click(botao)
    expect(gerarInsight).toHaveBeenCalledTimes(1)
    await act(async () => pedido.resolver(DA_IA))
    expect(within(viva).getByRole('heading', { name: DA_IA.titulo })).toBeTruthy()
  })

  it('texto da IA: selo "Gerado por IA", sem a linha de texto alternativo', async () => {
    await gerarCom(DA_IA)
    expect(within(card()).getByText('Gerado por IA')).toBeTruthy()
    expect(within(card()).queryByText('Texto alternativo')).toBeNull()
    expect(within(card()).queryByText(/montado por regra/)).toBeNull()
    expect(within(card()).getByText(DA_IA.texto)).toBeTruthy()
    expect(within(card()).getByText(/^Gerado em /)).toBeTruthy()
  })

  it('texto por regra: selo "Texto alternativo" em tom neutro e a linha explicativa', async () => {
    await gerarCom(ALTERNATIVO)
    const selo = within(card()).getByText('Texto alternativo')
    expect(selo.closest('span')?.className).toContain('bg-surface-alt')
    expect(selo.closest('span')?.className).not.toContain('alerta')
    expect(within(card()).queryByText('Gerado por IA')).toBeNull()
    expect(
      within(card()).getByText('Resumo montado por regra, com os mesmos números da tela.'),
    ).toBeTruthy()
  })

  it('lista os números com rótulo, no mesmo formato do texto', async () => {
    await gerarCom(ALTERNATIVO)
    const abrir = within(card()).getByRole('button', {
      name: `Ver os ${ALTERNATIVO.numeros_utilizados.length} números utilizados`,
    })
    expect(abrir.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(abrir)
    expect(abrir.getAttribute('aria-expanded')).toBe('true')
    const lista = within(card()).getByRole('list', { name: 'Números utilizados no resumo' })
    const itens = within(lista)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(itens).toContain('Valor da conta: R$ 486,00')
    expect(itens).toContain('Aumento do valor da conta: 42%')
    expect(itens).toContain('Consumo no mesmo mês do ano anterior: 298 kWh')
    // Cada valor da lista aparece igual no texto
    for (const numero of ALTERNATIVO.numeros_utilizados) {
      expect(ALTERNATIVO.texto).toContain(formatarNumeroResumo(numero))
    }
  })

  it.each([
    [new ApiError(404, 'UC_INEXISTENTE', 'x'), 'Não há resumo disponível para esta unidade.'],
    [
      new ApiError(503, 'GOLD_NAO_CARREGADA', 'x'),
      'Os dados ainda não foram carregados no servidor. Tente de novo em instantes.',
    ],
    [
      new ApiError(0, 'ERRO_INTERNO', 'Failed to fetch'),
      'Sem conexão com o servidor. Confira a rede e tente de novo.',
    ],
    [
      new ApiError(422, 'DADOS_INVALIDOS', 'x'),
      'Não foi possível gerar o resumo para o período desta tela.',
    ],
  ])('erro %s: mensagem clara e "Tentar de novo" refaz a chamada', async (erro, mensagem) => {
    vi.mocked(gerarInsight).mockRejectedValueOnce(erro).mockResolvedValueOnce(DA_IA)
    abrirCard()
    fireEvent.click(botaoGerar())
    const alerta = await within(card()).findByRole('alert')
    expect(within(alerta).getByText(mensagem)).toBeTruthy()
    expect(within(alerta).getByText('O restante da tela continua válido.')).toBeTruthy()
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(card()).findByRole('heading', { name: DA_IA.titulo })).toBeTruthy()
    expect(gerarInsight).toHaveBeenCalledTimes(2)
  })

  it('depois de gerado, o botão some e não há nova chamada', async () => {
    await gerarCom(DA_IA)
    expect(within(card()).queryByRole('button', { name: /Gerar resumo/ })).toBeNull()
    expect(gerarInsight).toHaveBeenCalledTimes(1)
  })

  it('ao trocar de UC volta ao estado inicial, e a resposta atrasada da UC anterior não aparece', async () => {
    vi.mocked(buscarUnidade).mockImplementation(
      async (id: string) =>
        (id === 'UC-DEMO-001' ? unidadeFixture : unidadeRecenteFixture) as Unidade360,
    )
    const atrasada = adiada<RespostaInsight>()
    vi.mocked(gerarInsight).mockReturnValueOnce(atrasada.promessa)
    const { rerender } = render(
      <MemoryRouter>
        <DetalheUnidade id="UC-DEMO-001" />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar resumo' }))
    rerender(
      <MemoryRouter>
        <DetalheUnidade id="UC-DEMO-007" />
      </MemoryRouter>,
    )
    expect(await screen.findByText(unidadeRecenteFixture.cadastro.id_uc)).toBeTruthy()
    await act(async () => atrasada.resolver(DA_IA))
    expect(botaoGerar().textContent).toContain('Gerar resumo')
    expect((botaoGerar() as HTMLButtonElement).disabled).toBe(false)
    expect(within(card()).queryByRole('heading', { name: DA_IA.titulo })).toBeNull()
  })
})

describe('formatarNumeroResumo', () => {
  it.each([
    [{ valor: 2357.68, unidade: 'BRL' }, 'R$ 2.357,68'],
    [{ valor: 42.15, unidade: 'BRL' }, 'R$ 42,15'],
    [{ valor: 3681, unidade: 'kWh' }, '3.681 kWh'],
    [{ valor: 82.83, unidade: 'kWh' }, '82,83 kWh'],
    [{ valor: 41.81, unidade: '%' }, '42%'],
    [{ valor: 37.5, unidade: '%' }, '38%'],
    [{ valor: 2.36, unidade: '%' }, '2%'],
    [{ valor: null, unidade: 'BRL' }, '—'],
  ])('%o → %s', (numero, esperado) => {
    expect(formatarNumeroResumo(numero)).toBe(esperado)
  })
})
