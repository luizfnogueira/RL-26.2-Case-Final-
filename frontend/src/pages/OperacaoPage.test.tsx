import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from '@/data/mocks/operacao.json'
import * as operacaoService from '@/services/operacao'
import { ApiError } from '@/services/erro-api'
import type { Operacao } from '@/types/operacao'
import { formatarAtualizacao } from '@/utils/datas'
import OperacaoPage from './OperacaoPage'

vi.mock('@/hooks/useOpcoesFiltros', () => ({
  useOpcoesFiltros: () => ({
    opcoes: {
      municipios: ['RECIFE', 'OLINDA', 'JABOATÃO DOS GUARARAPES'],
      bairros: { RECIFE: ['BOA VIAGEM', 'CASA AMARELA', 'BOA VISTA'], OLINDA: ['RIO DOCE'] },
      alimentadores: [
        'ALM-DEMO-001',
        'ALM-DEMO-002',
        'ALM-DEMO-003',
        'ALM-DEMO-004',
        'ALM-DEMO-005',
      ],
    },
    metadados: null,
    erro: null,
    carregando: false,
  }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Endereco() {
  return <output aria-label="Endereço atual">{useLocation().search}</output>
}

function abrir(url = '/operacao') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <OperacaoPage />
      <Endereco />
    </MemoryRouter>,
  )
}

const exemplo = () => structuredClone(fixture) as Operacao
const endereco = () => new URLSearchParams(screen.getByLabelText('Endereço atual').textContent!)
const ranking = () => screen.getByRole('table', { name: 'Ranking de alimentadores' })

describe('Tela 6 — Operação', () => {
  it('mostra quatro indicadores do alimentador, histórico, ranking e data da fonte', async () => {
    const dados = exemplo()
    dados.ranking_alimentadores.items[0].dec.valor = 17.1234
    vi.spyOn(operacaoService, 'buscarOperacao').mockResolvedValue(dados)
    abrir()
    expect(screen.getByLabelText('Carregando operação')).toBeTruthy()
    const indicadores = await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    expect(within(indicadores).getAllByRole('heading', { level: 3 })).toHaveLength(4)
    expect(within(indicadores).getByText('17,1234')).toBeTruthy()
    expect(screen.getByRole('img', { name: /Evolução mensal de DEC de ALM-DEMO-003/ })).toBeTruthy()
    expect(within(ranking()).getAllByRole('row')).toHaveLength(6)
    expect(screen.getByText('Dado fictício')).toBeTruthy()
    expect(screen.getByText(formatarAtualizacao(dados.metadados.gold_atualizada_em!))).toBeTruthy()
  })

  it('filtra município e bairro usando os valores originais em maiúsculas de GET /filtros', async () => {
    abrir()
    await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    fireEvent.change(screen.getByRole('combobox', { name: 'Município' }), {
      target: { value: 'RECIFE' },
    })
    await waitFor(() => expect(within(ranking()).getAllByRole('row')).toHaveLength(4))
    fireEvent.change(screen.getByRole('combobox', { name: 'Bairro' }), {
      target: { value: 'CASA AMARELA' },
    })
    await screen.findByLabelText('Indicadores de ALM-DEMO-002')
    expect(within(ranking()).getAllByRole('row')).toHaveLength(2)
    expect(endereco().get('municipio')).toBe('RECIFE')
    expect(endereco().get('bairro')).toBe('CASA AMARELA')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(within(ranking()).getAllByRole('row')).toHaveLength(6))
    expect(endereco().toString()).toBe('')
  })

  it('analisa um alimentador sem exigir município e mantém a seleção ao mudar o período', async () => {
    const buscar = vi.spyOn(operacaoService, 'buscarOperacao')
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Analisar ALM-DEMO-002' }))
    await screen.findByLabelText('Indicadores de ALM-DEMO-002')
    expect(endereco().get('alimentador')).toBe('ALM-DEMO-002')
    expect(within(ranking()).getAllByRole('row')).toHaveLength(2)
    // O mock existente só tem a janela P2; aqui validamos a persistência do recorte.
    buscar.mockResolvedValueOnce(await buscar.mock.results.at(-1)!.value)
    fireEvent.change(screen.getByRole('combobox', { name: 'Período atual' }), {
      target: { value: '2022-07/2023-06' },
    })
    await screen.findByLabelText('Indicadores de ALM-DEMO-002')
    expect(endereco().get('alimentador')).toBe('ALM-DEMO-002')
    buscar.mockResolvedValueOnce(exemplo())
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos os alimentadores' }))
    await waitFor(() => expect(within(ranking()).getAllByRole('row')).toHaveLength(6))
    expect(endereco().has('alimentador')).toBe(false)
  })

  it('permite selecionar alimentador diretamente no filtro global', async () => {
    abrir()
    await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    fireEvent.change(screen.getByRole('combobox', { name: 'Alimentador' }), {
      target: { value: 'ALM-DEMO-005' },
    })
    await screen.findByLabelText('Indicadores de ALM-DEMO-005')
    expect(endereco().get('alimentador')).toBe('ALM-DEMO-005')
  })

  it('alterna DEC/FEC sem nova consulta e oferece todos os meses em tabela e pelo teclado', async () => {
    const buscar = vi.spyOn(operacaoService, 'buscarOperacao')
    abrir()
    const seletor = await screen.findByRole('slider', { name: 'Mês em destaque' })
    fireEvent.change(seletor, { target: { value: '0' } })
    expect(screen.getByText('Jul/2025', { selector: 'strong' })).toBeTruthy()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Indicador do histórico' })).getByRole('button', {
        name: 'FEC',
      }),
    )
    expect(screen.getByRole('img', { name: /Evolução mensal de FEC/ })).toBeTruthy()
    expect(endereco().get('indicador')).toBe('fec')
    expect(buscar).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    const tabela = screen.getByRole('table', { name: 'Histórico de FEC de ALM-DEMO-003' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(13)
    expect(within(tabela).getByRole('rowheader', { name: 'Jun/2026' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver gráfico' }))
    expect(screen.getByRole('img', { name: /Evolução mensal de FEC/ })).toBeTruthy()
  })

  it('solicita a ordenação ao servidor e reseta a página', async () => {
    const buscar = vi.spyOn(operacaoService, 'buscarOperacao')
    abrir('/operacao?page=2')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Ordenar por' }), {
      target: { value: 'chi' },
    })
    await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    expect(buscar).toHaveBeenLastCalledWith(
      expect.objectContaining({ ordenar_por: 'chi', page: 1, page_size: 10 }),
      expect.any(AbortSignal),
    )
    expect(endereco().has('page')).toBe(false)
    const linhas = within(ranking()).getAllByRole('row')
    expect(within(linhas[2]).getByRole('button', { name: 'Analisar ALM-DEMO-005' })).toBeTruthy()
  })

  it('consulta ranking de bairros e abre seus alimentadores mantendo o recorte', async () => {
    const buscar = vi.spyOn(operacaoService, 'buscarOperacao')
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Municípios e bairros' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Agrupar região por' }), {
      target: { value: 'bairro' },
    })
    const botao = await screen.findByRole('button', { name: 'Ver alimentadores de Casa Amarela' })
    expect(buscar).toHaveBeenLastCalledWith(
      expect.objectContaining({ nivel_regional: 'bairro', page: 1 }),
      expect.any(AbortSignal),
    )
    expect(
      screen.getByText(/Bairros que compartilham alimentadores não podem ser somados/),
    ).toBeTruthy()
    fireEvent.click(botao)
    await screen.findByLabelText('Indicadores de ALM-DEMO-002')
    expect(endereco().get('municipio')).toBe('Recife')
    expect(endereco().get('bairro')).toBe('Casa Amarela')
    expect(endereco().get('visao')).toBe('alimentadores')
    expect(within(ranking()).getAllByRole('row')).toHaveLength(2)
  })

  it('usa a paginação do servidor sem truncar o histórico mensal', async () => {
    const primeira = exemplo()
    primeira.ranking_alimentadores.total = 12
    primeira.ranking_alimentadores.page_size = 10
    const segunda = structuredClone(primeira)
    segunda.ranking_alimentadores.page = 2
    segunda.ranking_alimentadores.items = [segunda.ranking_alimentadores.items[4]]
    segunda.ranking_alimentadores.items[0].posicao = 11
    const buscar = vi
      .spyOn(operacaoService, 'buscarOperacao')
      .mockResolvedValueOnce(primeira)
      .mockResolvedValueOnce(segunda)
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Próxima página' }))
    await screen.findByLabelText('Indicadores de ALM-DEMO-005')
    expect(buscar).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, page_size: 10 }),
      expect.any(AbortSignal),
    )
    expect(screen.getByText('11–12 de 12')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    expect(
      within(screen.getByRole('table', { name: 'Histórico de DEC de ALM-DEMO-005' })).getAllByRole(
        'row',
      ),
    ).toHaveLength(13)
  })

  it('recupera uma página além do total sem esconder o histórico não paginado', async () => {
    abrir('/operacao?page=99')
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar à primeira página' }))
    await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    expect(endereco().has('page')).toBe(false)
    expect(within(ranking()).getAllByRole('row')).toHaveLength(6)
  })

  it('mostra erro, permite tentar de novo e não mantém números de outra consulta', async () => {
    const buscar = vi
      .spyOn(operacaoService, 'buscarOperacao')
      .mockResolvedValueOnce(exemplo())
      .mockRejectedValueOnce(new ApiError(503, 'ERRO_INTERNO', 'Fonte indisponível.'))
      .mockResolvedValueOnce(exemplo())
    abrir()
    await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    fireEvent.change(screen.getByRole('combobox', { name: 'Município' }), {
      target: { value: 'RECIFE' },
    })
    expect(screen.getByLabelText('Carregando operação')).toBeTruthy()
    expect(screen.queryByLabelText('Indicadores de ALM-DEMO-003')).toBeNull()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Fonte indisponível.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    expect(buscar).toHaveBeenCalledTimes(3)
  })

  it('trata retorno vazio com ação para limpar o recorte', async () => {
    const vazio = exemplo()
    vazio.serie_historica = []
    vazio.ranking_alimentadores = { items: [], page: 1, page_size: 10, total: 0 }
    vazio.ranking_regional = {
      ...vazio.ranking_alimentadores,
      items: [],
      nivel_regional: 'municipio',
    }
    vi.spyOn(operacaoService, 'buscarOperacao')
      .mockResolvedValueOnce(vazio)
      .mockResolvedValueOnce(exemplo())
    abrir('/operacao?municipio=OLINDA')
    expect(await screen.findByText('Sem dados de operação para este recorte')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar recorte' }))
    await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    expect(endereco().has('municipio')).toBe(false)
  })

  it('preserva zeros, mostra ausências sem dias críticos e usa os metadados reais', async () => {
    const dados = exemplo()
    dados.metadados.dados_ficticios = false
    dados.metadados.gold_atualizada_em = null
    const alimentador = dados.ranking_alimentadores.items[0]
    alimentador.dec.valor = 0
    alimentador.dec_sem_dia_critico.valor = null
    const serie = dados.serie_historica.find((s) => s.alimentador === alimentador.alimentador)!
    serie.pontos.forEach((p) => {
      p.dec.valor = 0
      p.dec_sem_dia_critico.valor = null
    })
    vi.spyOn(operacaoService, 'buscarOperacao').mockResolvedValue(dados)
    abrir()
    const indicadores = await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    expect(within(indicadores).getByText('0')).toBeTruthy()
    expect(screen.queryByText('Dado fictício')).toBeNull()
    expect(screen.getByText('Atualização não informada')).toBeTruthy()
    expect(
      screen.getByText('Fonte: Gold PostgreSQL. Data de atualização não informada pela fonte.'),
    ).toBeTruthy()
    expect(
      screen.getByText(/A fonte não disponibiliza este indicador sem dias críticos/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    const tabela = screen.getByRole('table', { name: 'Histórico de DEC de ALM-DEMO-003' })
    expect(within(tabela).getAllByText('0')).toHaveLength(12)
    expect(within(tabela).getAllByText('—')).toHaveLength(12)
  })

  it('valida o período personalizado e o envia à API, mantendo o valor no seletor', async () => {
    const buscar = vi.spyOn(operacaoService, 'buscarOperacao').mockResolvedValue(exemplo())
    abrir()
    await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    fireEvent.click(screen.getByText('Escolher outro período'))
    fireEvent.change(screen.getByLabelText('Mês inicial'), { target: { value: '2026-06' } })
    fireEvent.change(screen.getByLabelText('Mês final'), { target: { value: '2026-05' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Período personalizado' }))
    expect(screen.getByRole('alert').textContent).toContain('início anterior ou igual ao fim')
    expect(buscar).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Mês final'), { target: { value: '2026-06' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Período personalizado' }))
    await screen.findByLabelText('Indicadores de ALM-DEMO-003')
    expect(buscar).toHaveBeenLastCalledWith(
      expect.objectContaining({ periodo_atual: '2026-06' }),
      expect.any(AbortSignal),
    )
    expect(
      (screen.getByRole('combobox', { name: 'Período atual' }) as HTMLSelectElement).value,
    ).toBe('2026-06')
  })
})
