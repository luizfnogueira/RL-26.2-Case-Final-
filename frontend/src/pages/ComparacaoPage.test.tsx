import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '@/data/mocks/comparacao.json'
import { useOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import * as servico from '@/services/dashboard'
import { ApiError } from '@/services/erro-api'
import type { Comparacao, ParamsComparacao } from '@/types/dashboard'
import PainelPage from './PainelPage'

vi.mock('@/hooks/useOpcoesFiltros', () => ({ useOpcoesFiltros: vi.fn() }))
const opcoes = {
  municipios: ['RECIFE', 'OLINDA', 'PAULISTA', 'CAMARAGIBE', 'JABOATÃO DOS GUARARAPES'],
  bairros: {
    RECIFE: ['BOA VIAGEM', 'BOA VISTA', 'BAIRRO COM, VIRGULA'],
    OLINDA: ['RIO DOCE', 'CASA CAIADA'],
  },
  classes: ['RESIDENCIAL', 'COMERCIAL', 'INDUSTRIAL'],
}
const PA = '2025-07/2026-06',
  PC = '2022-07/2023-06'
const urlPadrao = '/painel?aba=comparar&nivel=municipio&itens=RECIFE&itens=OLINDA'
const exemplo = () => structuredClone(fixture) as Comparacao

function dadosDoPedido(params: ParamsComparacao): Comparacao {
  const dados = exemplo()
  dados.filtros = { ...dados.filtros, ...params, itens: [...params.itens] }
  dados.itens = params.itens.map((nome, i) => ({ ...structuredClone(dados.itens[i % 2]), nome }))
  return dados
}

function Endereco() {
  return <output aria-label="URL da comparação">{useLocation().search}</output>
}
function Tela({ url }: { url: string }) {
  return (
    <MemoryRouter initialEntries={[url]}>
      <PainelPage />
      <Endereco />
    </MemoryRouter>
  )
}
const abrir = (url = urlPadrao) => render(<Tela url={url} />)
const endereco = () => new URLSearchParams(screen.getByLabelText('URL da comparação').textContent!)
const tabela = () =>
  screen.getByRole('table', { name: 'Comparação dos seis indicadores por recorte' })
const espiar = () =>
  vi.spyOn(servico, 'buscarComparacao').mockImplementation(async (params) => dadosDoPedido(params))

beforeEach(() => {
  vi.mocked(useOpcoesFiltros).mockReturnValue({
    opcoes,
    metadados: null,
    carregando: false,
    erro: null,
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('C3 integrada ao seletor e à camada de dados existentes', () => {
  it('orienta a correção de durações diferentes e consulta só depois de corrigir o período', async () => {
    vi.mocked(useOpcoesFiltros).mockReturnValue({
      opcoes: { ...opcoes, periodos: [PA, PC, '2026-06', '2025-06'] },
      metadados: null,
      carregando: false,
      erro: null,
    })
    const buscar = espiar()
    abrir(urlPadrao + '&periodo_atual=2026-06&periodo_comparacao=' + PC)
    expect(screen.getByRole('alert').textContent).toContain(
      'O atual tem 1 mês e o de comparação tem 12 meses',
    )
    expect(buscar).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByLabelText('Carregando comparação de recortes')).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Comparar com' }), {
      target: { value: '2025-06' },
    })
    await screen.findByRole('columnheader', { name: 'Recife' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(buscar).toHaveBeenLastCalledWith(
      expect.objectContaining({ periodo_atual: '2026-06', periodo_comparacao: '2025-06' }),
      expect.any(AbortSignal),
    )
    expect(endereco().getAll('itens')).toEqual(['RECIFE', 'OLINDA'])
  })

  it('não envia períodos iguais vindos de um link e permite corrigir sem perder a seleção', async () => {
    const buscar = espiar()
    abrir(urlPadrao + '&periodo_atual=' + PA + '&periodo_comparacao=' + PA)
    expect(screen.getByRole('alert').textContent).toContain('Escolha períodos diferentes')
    expect(buscar).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Comparar com' }), {
      target: { value: PC },
    })
    await screen.findByRole('columnheader', { name: 'Recife' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('oculta resultados anteriores quando a mudança de período torna a comparação inválida', async () => {
    vi.mocked(useOpcoesFiltros).mockReturnValue({
      opcoes: { ...opcoes, periodos: [PA, PC, '2026-06'] },
      metadados: null,
      carregando: false,
      erro: null,
    })
    const buscar = espiar()
    abrir()
    await screen.findByRole('columnheader', { name: 'Recife' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Período atual' }), {
      target: { value: '2026-06' },
    })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('mesma duração')
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('inverte as duas janelas em uma única mudança e mantém os itens', async () => {
    const buscar = espiar()
    abrir()
    await screen.findByRole('columnheader', { name: 'Recife' })
    fireEvent.click(screen.getByRole('button', { name: 'Inverter períodos' }))
    await waitFor(() =>
      expect(buscar.mock.calls.at(-1)![0]).toMatchObject({
        periodo_atual: PC,
        periodo_comparacao: PA,
        itens: ['RECIFE', 'OLINDA'],
      }),
    )
    expect(endereco().get('periodo_atual')).toBe(PC)
  })

  it('mantém um item vazio ao lado dos demais e explica os indicadores ausentes', async () => {
    abrir('/painel?aba=comparar&nivel=municipio&itens=SEM_CADASTRO&itens=RECIFE')
    const cabecalho = await screen.findByRole('columnheader', { name: 'Sem_cadastro' })
    expect(cabecalho).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Recife' })).toBeTruthy()
    expect(screen.getByText(/SEM_CADASTRO: nenhuma UC neste recorte/)).toBeTruthy()
    expect(screen.getAllByTitle(/Nenhuma UC ativa neste recorte/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Remover Sem_cadastro' })).toBeTruthy()
  })

  it('informa o carregamento das opções sem perder a comparação do link', async () => {
    vi.mocked(useOpcoesFiltros).mockReturnValue({
      opcoes: {},
      metadados: null,
      carregando: true,
      erro: null,
    })
    espiar()
    abrir()
    expect(screen.getByLabelText('Carregando opções de comparação')).toBeTruthy()
    await screen.findByRole('columnheader', { name: 'Recife' })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('funciona com o mock existente, os dois períodos, os seis indicadores e o selo fictício', async () => {
    abrir()
    await screen.findByRole('columnheader', { name: 'Recife' })
    expect(within(tabela()).getAllByRole('row')).toHaveLength(7)
    expect(screen.getByText('2 recortes comparados')).toBeTruthy()
    expect(screen.getByText('Dado fictício')).toBeTruthy()
    expect(screen.getByText(/Jul\/2025 – Jun\/2026 vs. Jul\/2022 – Jun\/2023/)).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Recife' }).getAttribute('checked')).not.toBeNull()
  })

  it('consulta só após dois itens e grava os valores originais como parâmetros repetidos', async () => {
    const buscar = espiar()
    abrir('/painel?aba=comparar')
    expect(screen.getByText('Selecione de 2 a 4 itens para comparar')).toBeTruthy()
    expect(buscar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Recife' }))
    expect(buscar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Olinda' }))
    await screen.findByRole('columnheader', { name: 'Recife' })
    expect(buscar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nivel: 'municipio',
        itens: ['RECIFE', 'OLINDA'],
        periodo_atual: PA,
        periodo_comparacao: PC,
      }),
      expect.any(AbortSignal),
    )
    expect(endereco().getAll('itens')).toEqual(['RECIFE', 'OLINDA'])
  })

  it('limita a quatro itens pelo seletor C4 e permite remover itens sem perder a aba', async () => {
    espiar()
    abrir()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Paulista' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Camaragibe' }))
    expect(
      screen.getByRole('checkbox', { name: 'Jaboatão dos Guararapes' }).hasAttribute('disabled'),
    ).toBe(true)
    expect(endereco().getAll('itens')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Remover Olinda' }))
    expect(endereco().getAll('itens')).toEqual(['RECIFE', 'PAULISTA', 'CAMARAGIBE'])
    fireEvent.click(screen.getByRole('button', { name: 'Limpar comparação' }))
    expect(endereco().get('aba')).toBe('comparar')
    expect(endereco().getAll('itens')).toEqual([])
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('usa município pai nos bairros e preserva nomes com vírgula sem modificar C2 ou C4', async () => {
    const buscar = espiar()
    abrir('/painel?aba=comparar')
    fireEvent.change(screen.getByRole('combobox', { name: 'Comparar por' }), {
      target: { value: 'bairro' },
    })
    expect(screen.getByText('Escolha o município antes de selecionar os bairros.')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Município' }), {
      target: { value: 'RECIFE' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Boa Viagem' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bairro Com, Virgula' }))
    await waitFor(() => expect(buscar).toHaveBeenCalled())
    expect(buscar.mock.calls.at(-1)![0]).toMatchObject({
      nivel: 'bairro',
      municipio: 'RECIFE',
      itens: ['BOA VIAGEM', 'BAIRRO COM, VIRGULA'],
    })
    expect(endereco().getAll('itens')).toEqual(['BOA VIAGEM', 'BAIRRO COM, VIRGULA'])
    expect(screen.queryByRole('checkbox', { name: 'Rio Doce' })).toBeNull()
  })

  it('preserva filtros opcionais de classes e limpa pais incompatíveis ao mudar o nível', async () => {
    const buscar = espiar()
    abrir(
      '/painel?aba=comparar&nivel=classe&municipio=RECIFE&bairro=BOA%20VIAGEM&itens=RESIDENCIAL&itens=COMERCIAL',
    )
    await screen.findByRole('columnheader', { name: 'Residencial' })
    expect(buscar.mock.calls.at(-1)![0]).toMatchObject({
      nivel: 'classe',
      municipio: 'RECIFE',
      bairro: 'BOA VIAGEM',
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Município' }), {
      target: { value: 'OLINDA' },
    })
    await waitFor(() =>
      expect(buscar.mock.calls.at(-1)![0]).toMatchObject({
        municipio: 'OLINDA',
        bairro: undefined,
      }),
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Comparar por' }), {
      target: { value: 'municipio' },
    })
    expect(endereco().has('municipio')).toBe(false)
    expect(endereco().has('bairro')).toBe(false)
    expect(endereco().getAll('itens')).toEqual([])
  })

  it('restaura a seleção pelo link e mantém períodos mensais vindos da Receita', async () => {
    const buscar = espiar()
    const url =
      '/painel?aba=comparar&nivel=municipio&itens=RECIFE&itens=OLINDA&periodo_atual=2026-06&periodo_comparacao=2025-06'
    const tela = abrir(url)
    await screen.findByRole('columnheader', { name: 'Recife' })
    const link = '/painel?' + endereco().toString()
    tela.unmount()
    abrir(link)
    await screen.findByRole('columnheader', { name: 'Recife' })
    expect(buscar.mock.calls.at(-1)![0]).toMatchObject({
      periodo_atual: '2026-06',
      periodo_comparacao: '2025-06',
      itens: ['RECIFE', 'OLINDA'],
    })
    expect(
      (screen.getByRole('combobox', { name: 'Período atual' }) as HTMLSelectElement).value,
    ).toBe('2026-06')
  })

  it('exibe carregamento e trata erro da API com nova tentativa', async () => {
    let concluir!: (dados: Comparacao) => void
    vi.spyOn(servico, 'buscarComparacao')
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            concluir = r
          }),
      )
      .mockRejectedValueOnce(
        new ApiError(503, 'ERRO_INTERNO', 'Serviço temporariamente indisponível.'),
      )
      .mockResolvedValueOnce(exemplo())
    abrir()
    expect(screen.getByLabelText('Carregando comparação de recortes')).toBeTruthy()
    await act(async () => {
      concluir(exemplo())
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Paulista' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Serviço temporariamente indisponível.',
    )
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await screen.findByRole('columnheader', { name: 'Recife' })
  })

  it('não deixa a resposta antiga substituir uma seleção mais recente', async () => {
    const pendentes: Array<{
      resolver: (d: Comparacao) => void
      pedido: ParamsComparacao
      sinal?: AbortSignal
    }> = []
    vi.spyOn(servico, 'buscarComparacao').mockImplementation(
      (pedido, sinal) => new Promise((resolver) => pendentes.push({ resolver, pedido, sinal })),
    )
    abrir()
    await waitFor(() => expect(pendentes).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Remover Olinda' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Paulista' }))
    await waitFor(() => expect(pendentes).toHaveLength(2))
    expect(pendentes[0].sinal?.aborted).toBe(true)
    await act(async () => {
      pendentes[1].resolver(dadosDoPedido(pendentes[1].pedido))
    })
    await screen.findByRole('columnheader', { name: 'Paulista' })
    await act(async () => {
      pendentes[0].resolver(dadosDoPedido(pendentes[0].pedido))
    })
    expect(screen.queryByRole('columnheader', { name: 'Olinda' })).toBeNull()
  })

  it('permite corrigir um link com mais de quatro itens sem enviar pedido inválido', async () => {
    const buscar = espiar()
    abrir(urlPadrao + '&itens=PAULISTA&itens=CAMARAGIBE&itens=JABOAT%C3%83O%20DOS%20GUARARAPES')
    expect(screen.getByText(/O link contém mais de 4 recortes/)).toBeTruthy()
    expect(buscar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remover Paulista' }))
    await waitFor(() => expect(buscar).toHaveBeenCalled())
    expect(buscar.mock.calls.at(-1)![0].itens).toHaveLength(4)
  })

  it('mantém a comparação do link disponível quando as opções falham', async () => {
    vi.mocked(useOpcoesFiltros).mockReturnValue({
      opcoes: {},
      metadados: null,
      carregando: false,
      erro: new ApiError(503, 'ERRO_INTERNO', 'Sem opções'),
    })
    abrir()
    await screen.findByRole('columnheader', { name: 'Recife' })
    expect(screen.getByText(/Não foi possível carregar as opções de recortes/)).toBeTruthy()
  })

  it('permite navegar nas abas com teclado e mantém a seleção ao voltar', async () => {
    espiar()
    abrir()
    await screen.findByRole('columnheader', { name: 'Recife' })
    const comparar = screen.getByRole('tab', { name: 'Comparar' })
    comparar.focus()
    fireEvent.keyDown(comparar, { key: 'Home' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Visão geral' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    await screen.findByRole('columnheader', { name: 'Recife' })
    expect(endereco().getAll('itens')).toEqual(['RECIFE', 'OLINDA'])
  })
})
