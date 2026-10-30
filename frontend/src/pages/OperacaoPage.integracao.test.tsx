import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as operacaoService from '@/services/operacao'
import { numeroOperacao } from '@/components/operacao/formatacao'
import type { Operacao } from '@/types/operacao'
import OperacaoPage from './OperacaoPage'

// Opt-in: VITE_TEST_API_REAL=http://127.0.0.1:8000 npm test -- OperacaoPage.integracao
// Executa GETs contra o backend e a Gold disponíveis, sem mocks nem escrita no banco.
vi.mock('@/services/env', () => ({
  API_URL: import.meta.env.VITE_TEST_API_REAL,
  USE_MOCKS: false,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function abrir() {
  render(
    <MemoryRouter initialEntries={['/operacao']}>
      <OperacaoPage />
    </MemoryRouter>,
  )
}

async function carregou() {
  await waitFor(() => expect(screen.queryByLabelText('Carregando operação')).toBeNull(), {
    timeout: 15000,
  })
  expect(screen.queryByRole('alert')).toBeNull()
}

describe.skipIf(!import.meta.env.VITE_TEST_API_REAL)('Tela 6 integrada à API e à Gold', () => {
  it('exibe os números reais e reconsulta ao selecionar um alimentador do ranking', async () => {
    const buscar = vi.spyOn(operacaoService, 'buscarOperacao')
    abrir()
    await carregou()
    const dados: Operacao = await buscar.mock.results.at(-1)!.value
    expect(dados.metadados.dados_ficticios).toBe(false)
    const primeiro = dados.ranking_alimentadores.items[0]
    expect(primeiro).toBeTruthy()
    const indicadores = screen.getByLabelText(`Indicadores de ${primeiro.alimentador}`)
    expect(within(indicadores).getByText(numeroOperacao(primeiro.dec.valor))).toBeTruthy()
    expect(screen.queryByText('Dado fictício')).toBeNull()
    await waitFor(() =>
      expect(
        within(screen.getByRole('combobox', { name: 'Município' })).getAllByRole('option').length,
      ).toBeGreaterThan(1),
    )
    fireEvent.click(screen.getByRole('button', { name: `Analisar ${primeiro.alimentador}` }))
    await carregou()
    const filtrado: Operacao = await buscar.mock.results.at(-1)!.value
    expect(filtrado.filtros.alimentador).toBe(primeiro.alimentador)
    expect(filtrado.ranking_alimentadores.total).toBe(1)
    expect(
      within(screen.getByRole('table', { name: 'Ranking de alimentadores' })).getAllByRole('row'),
    ).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    const tabela = screen.getByRole('table', {
      name: `Histórico de DEC de ${primeiro.alimentador}`,
    })
    expect(within(tabela).getAllByRole('row')).toHaveLength(
      filtrado.serie_historica[0].pontos.length + 1,
    )
  }, 30000)

  it('pagina o ranking regional pelo total próprio e muda para bairros sem somar denominadores', async () => {
    const buscar = vi.spyOn(operacaoService, 'buscarOperacao')
    abrir()
    await carregou()
    fireEvent.click(screen.getByRole('button', { name: 'Municípios e bairros' }))
    await carregou()
    const municipios: Operacao = await buscar.mock.results.at(-1)!.value
    expect(
      within(screen.getByRole('table', { name: 'Ranking regional' })).getAllByRole('row'),
    ).toHaveLength(municipios.ranking_regional.items.length + 1)
    if (municipios.ranking_regional.total > municipios.ranking_regional.page_size) {
      fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
      await carregou()
      const segunda: Operacao = await buscar.mock.results.at(-1)!.value
      expect(segunda.ranking_regional.page).toBe(2)
      expect(
        within(screen.getByRole('table', { name: 'Ranking regional' })).getAllByRole('row'),
      ).toHaveLength(segunda.ranking_regional.items.length + 1)
    }
    fireEvent.change(screen.getByRole('combobox', { name: 'Agrupar região por' }), {
      target: { value: 'bairro' },
    })
    await carregou()
    const bairros: Operacao = await buscar.mock.results.at(-1)!.value
    expect(bairros.ranking_regional.nivel_regional).toBe('bairro')
    expect(bairros.ranking_regional.page).toBe(1)
    expect(bairros.ranking_regional.items.every((r) => r.bairro !== null)).toBe(true)
    expect(
      screen.getByText(/Bairros que compartilham alimentadores não podem ser somados/),
    ).toBeTruthy()
  }, 30000)
})
