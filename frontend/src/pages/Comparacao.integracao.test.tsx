import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buscarComparacao } from '@/services/dashboard'
import { buscarFiltros } from '@/services/filtros'
import { formatarNome, formatarReaisCompleto } from '@/utils/formatacao'
import { PERIODO_ATUAL_PADRAO as PA, PERIODO_COMPARACAO_PADRAO as PC } from '@/utils/periodos'
import PainelPage from './PainelPage'

// Opt-in, somente leitura: VITE_TEST_API_REAL=http://127.0.0.1:8000.
// Nenhum número ou nome da Gold é fixado ou gravado no repositório.
vi.mock('@/services/env', () => ({ API_URL: import.meta.env.VITE_TEST_API_REAL, USE_MOCKS: false }))
afterEach(cleanup)

function abrir(nivel: string, itens: string[]) {
  const params = new URLSearchParams({
    aba: 'comparar',
    nivel,
    periodo_atual: PA,
    periodo_comparacao: PC,
  })
  itens.forEach((item) => params.append('itens', item))
  render(
    <MemoryRouter initialEntries={['/painel?' + params.toString()]}>
      <PainelPage />
    </MemoryRouter>,
  )
}

describe.skipIf(!import.meta.env.VITE_TEST_API_REAL)('C3 com API e Gold reais', () => {
  it('apresenta os mesmos valores da API e carrega a seleção pelo link', async () => {
    const opcoes = await buscarFiltros()
    const itens = opcoes.municipios.slice(0, 2)
    expect(itens).toHaveLength(2)
    const resposta = await buscarComparacao({
      nivel: 'municipio',
      itens,
      periodo_atual: PA,
      periodo_comparacao: PC,
    })
    expect(resposta.metadados.dados_ficticios).toBe(false)
    abrir('municipio', itens)
    const tabela = await screen.findByRole(
      'table',
      { name: 'Comparação dos seis indicadores por recorte' },
      { timeout: 20000 },
    )
    await waitFor(
      () => expect(screen.queryByLabelText('Carregando opções de comparação')).toBeNull(),
      { timeout: 15000 },
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('Dado fictício')).toBeNull()
    const linha = within(tabela).getByRole('heading', { name: 'Receita por UC' }).closest('tr')!
    const celulas = within(linha).getAllByRole('cell')
    resposta.itens.forEach((item, i) => {
      expect(
        within(tabela).getByRole('columnheader', { name: formatarNome(item.nome) }),
      ).toBeTruthy()
      const atual = item.receita_media_uc.atual.valor
      expect(celulas[i + 1].textContent).toContain(
        atual === null ? '—' : formatarReaisCompleto(atual),
      )
      expect(
        (screen.getByRole('checkbox', { name: formatarNome(item.nome) }) as HTMLInputElement)
          .checked,
      ).toBe(true)
    })
  }, 30000)

  it('explica a ausência de DEC e FEC ao comparar classes', async () => {
    const opcoes = await buscarFiltros()
    const itens = opcoes.classes.slice(0, 2)
    expect(itens).toHaveLength(2)
    abrir('classe', itens)
    const tabela = await screen.findByRole(
      'table',
      { name: 'Comparação dos seis indicadores por recorte' },
      { timeout: 20000 },
    )
    const linha = within(tabela).getByRole('heading', { name: 'DEC' }).closest('tr')!
    expect(
      within(linha).getAllByTitle(/DEC e FEC não são disponibilizados/).length,
    ).toBeGreaterThan(0)
    expect(within(linha).queryByText('Pior valor')).toBeNull()
  }, 30000)
})
