import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from '@/data/mocks/dashboard.json'
import * as dashboardService from '@/services/dashboard'
import { ApiError } from '@/services/erro-api'
import type { Dashboard } from '@/types/dashboard'
import PainelPage from './PainelPage'

vi.mock('@/hooks/useOpcoesFiltros', () => ({
  useOpcoesFiltros: () => ({
    opcoes: { municipios: ['RECIFE', 'JABOATÃO DOS GUARARAPES', 'OLINDA'] },
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

function abrir(url = '/painel') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <PainelPage />
      <Endereco />
    </MemoryRouter>,
  )
}

const exemplo = () => structuredClone(fixture) as Dashboard

describe('Tela 1 — Painel executivo', () => {
  it('mostra seis KPIs, duas janelas, precisão da continuidade e selo do mock', async () => {
    abrir()
    expect(screen.getByLabelText('Carregando painel executivo')).toBeTruthy()
    const resumo = await screen.findByLabelText('Seis indicadores executivos')
    expect(within(resumo).getAllByRole('heading', { level: 3 })).toHaveLength(6)
    expect(within(resumo).getByRole('heading', { name: 'Valor em aberto' })).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'DEC médio' })).getByText('11,46'),
    ).toBeTruthy()
    expect(screen.getByText('4,5% da receita')).toBeTruthy()
    expect(screen.getByText('+0,7 p.p.')).toBeTruthy()
    expect(screen.getByText('Dado fictício')).toBeTruthy()
    expect(screen.getByText('Receita faturada e volume de energia · 48 meses')).toBeTruthy()
    expect(screen.getByText(/A receita faturada cresceu/)).toBeTruthy()
    expect(screen.getByText(/Jul\/2025 – Jun\/2026/, { selector: 'p' })).toBeTruthy()
  })

  it('filtra o município pela URL e mantém ausências reais do mock como travessão', async () => {
    abrir()
    await screen.findByLabelText('Seis indicadores executivos')
    fireEvent.change(screen.getByRole('combobox', { name: 'Município' }), {
      target: { value: 'RECIFE' },
    })
    expect(screen.getByLabelText('Endereço atual').textContent).toContain('municipio=RECIFE')
    const aviso = await screen.findAllByText(
      'DEC/FEC indisponíveis para este recorte na fonte consultada.',
    )
    expect(aviso).toHaveLength(2)
    expect(
      within(screen.getByRole('region', { name: 'DEC médio' })).getAllByText('—'),
    ).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await screen.findByText('11,46')
    expect(screen.getByLabelText('Endereço atual').textContent).toBe('')
  })

  it('preserva o município ao recarregar e no atalho da receita', async () => {
    abrir('/painel?municipio=OLINDA')
    const link = await screen.findByRole('link', { name: 'Ver diagnóstico da receita' })
    expect((screen.getByRole('combobox', { name: 'Município' }) as HTMLSelectElement).value).toBe(
      'OLINDA',
    )
    const destino = new URL(link.getAttribute('href')!, 'http://localhost')
    expect(destino.pathname).toBe('/receita')
    expect(destino.searchParams.get('municipio')).toBe('OLINDA')
    expect(destino.searchParams.get('periodo_atual')).toBe('2025-07/2026-06')
    expect(destino.searchParams.get('periodo_comparacao')).toBe('2022-07/2023-06')
  })

  it('permite selecionar um mês e consultar os 48 pontos em tabela', async () => {
    abrir()
    const seletor = await screen.findByRole('slider', { name: 'Mês em destaque' })
    fireEvent.change(seletor, { target: { value: '0' } })
    expect(screen.getByText('Jul/2022', { selector: 'strong' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    const tabela = screen.getByRole('table', { name: 'Histórico mensal de receita e volume' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(49)
    expect(within(tabela).getByRole('rowheader', { name: 'Jul/2022' })).toBeTruthy()
    expect(within(tabela).getByRole('rowheader', { name: 'Jun/2026' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver gráfico' }))
    expect(
      screen.getByRole('img', { name: /Histórico de receita faturada e volume de energia/ }),
    ).toBeTruthy()
  })

  it('mostra erro e refaz a consulta ao tentar de novo', async () => {
    const buscar = vi
      .spyOn(dashboardService, 'buscarDashboard')
      .mockRejectedValueOnce(
        new ApiError(503, 'ERRO_INTERNO', 'Fonte temporariamente indisponível.'),
      )
      .mockResolvedValueOnce(exemplo())
    abrir()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Fonte temporariamente indisponível.')).toBeTruthy()
    expect(screen.queryByLabelText('Seis indicadores executivos')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await screen.findByLabelText('Seis indicadores executivos')
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('não apresenta os números antigos enquanto o novo recorte carrega', async () => {
    vi.spyOn(dashboardService, 'buscarDashboard')
      .mockResolvedValueOnce(exemplo())
      .mockImplementationOnce(() => new Promise(() => {}))
    abrir()
    await screen.findByLabelText('Seis indicadores executivos')
    fireEvent.change(screen.getByRole('combobox', { name: 'Município' }), {
      target: { value: 'RECIFE' },
    })
    expect(screen.getByLabelText('Carregando painel executivo')).toBeTruthy()
    expect(screen.queryByLabelText('Seis indicadores executivos')).toBeNull()
  })

  it('trata consulta vazia sem fabricar zeros ou gráficos', async () => {
    const dados = exemplo()
    Object.values(dados.indicadores).forEach((kpi) => {
      kpi.atual.valor = null
    })
    dados.serie_historica = []
    vi.spyOn(dashboardService, 'buscarDashboard').mockResolvedValue(dados)
    abrir()
    expect(await screen.findByText('Sem dados para este recorte')).toBeTruthy()
    expect(screen.queryByLabelText('Seis indicadores executivos')).toBeNull()
    expect(screen.queryByRole('img', { name: /Histórico de receita/ })).toBeNull()
  })

  it('mantém valores zero e remove o selo quando a fonte não é fictícia', async () => {
    const dados = exemplo()
    dados.metadados.dados_ficticios = false
    dados.indicadores.inadimplencia.atual.valor = 0
    dados.indicadores.inadimplencia.percentual_receita_atual.valor = 0
    dados.indicadores.inadimplencia.variacao_percentual.valor = null
    vi.spyOn(dashboardService, 'buscarDashboard').mockResolvedValue(dados)
    abrir()
    await screen.findByLabelText('Seis indicadores executivos')
    const card = screen.getByRole('region', { name: 'Valor em aberto' })
    expect(within(card).getByText('R$ 0,00')).toBeTruthy()
    expect(within(card).getByText('0,0% da receita')).toBeTruthy()
    expect(within(card).getByText('Sem comparação')).toBeTruthy()
    expect(screen.queryByText('Dado fictício')).toBeNull()
  })

  it('abre a aba de comparação quando aba=comparar está na URL e exibe os itens comparados', async () => {
    abrir('/painel?aba=comparar&nivel=municipio&itens=RECIFE&itens=OLINDA')
    const abaComparar = screen.getByRole('tab', { name: 'Comparar' })
    expect(abaComparar.getAttribute('aria-selected')).toBe('true')
    const abaVisaoGeral = screen.getByRole('tab', { name: 'Visão geral' })
    expect(abaVisaoGeral.getAttribute('aria-selected')).toBe('false')

    expect(await screen.findByRole('tabpanel', { name: 'Aba de comparação' })).toBeTruthy()
    expect(await screen.findByText('Recife')).toBeTruthy()
    expect(await screen.findByText('Olinda')).toBeTruthy()
    expect(screen.getByText('2 recortes comparados')).toBeTruthy()

    fireEvent.click(abaVisaoGeral)
    expect(screen.getByLabelText('Endereço atual').textContent).not.toContain('aba=comparar')
    await screen.findByLabelText('Seis indicadores executivos')
  })
})
