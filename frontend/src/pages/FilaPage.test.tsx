import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import candidatosFixture from '@/data/mocks/candidatos.json'
import { buscarCandidatos } from '@/services'
import type { Candidatos, ParamsCandidatos } from '@/types/inspecoes'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gerarCsvCandidatos } from '@/utils/exportarCandidatos'
import FilaPage from './FilaPage'

const mocks = vi.hoisted(() => ({
  buscarCandidatos: vi.fn(),
  criarInspecao: vi.fn(),
  normalizarErro: vi.fn(),
}))

vi.mock('@/services', () => mocks)
vi.mock('@/hooks/useOpcoesFiltros', () => ({
  useOpcoesFiltros: () => ({
    municipios: ['Recife', 'Jaboatão dos Guararapes', 'Olinda'],
    classes: ['Comercial', 'Industrial', 'Residencial'],
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FilaPage', () => {
  it('exporta todos os candidatos filtrados em páginas e identifica os dados mockados', async () => {
    const todos = candidatosFixture as Candidatos
    const exportacao = Array.from({ length: 101 }, (_, index) => ({
      ...todos.items[index % todos.items.length],
      id_uc: `UC-EXPORT-${String(index + 1).padStart(3, '0')}`,
      posicao: index + 1,
    }))
    const chamadas = vi.mocked(buscarCandidatos)
    chamadas.mockImplementation((params: ParamsCandidatos) =>
      Promise.resolve(
        params.page_size === 100
          ? {
              ...todos,
              items: exportacao.slice(((params.page ?? 1) - 1) * 100, (params.page ?? 1) * 100),
              page: params.page ?? 1,
              page_size: 100,
              total: exportacao.length,
            }
          : todos,
      ),
    )

    const clickOriginal = HTMLAnchorElement.prototype.click
    const createObjectUrlOriginal = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    let arquivoBaixado = ''
    HTMLAnchorElement.prototype.click = function () {
      arquivoBaixado = this.download
    }
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:exportacao'),
    })

    try {
      render(
        <MemoryRouter initialEntries={['/perdas/fila']}>
          <FilaPage />
        </MemoryRouter>,
      )

      await screen.findByText('UC-DEMO-001')
      expect(screen.getByRole('columnheader', { name: 'Alimentador' })).toBeTruthy()
      expect(screen.getAllByText('ALM-DEMO-001').length).toBeGreaterThan(0)
      fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }))

      await screen.findByText('Dados fictícios: 101 candidatos exportados')
      expect(arquivoBaixado).toBe('fila-inspecao-mock.csv')
      const chamadasExportacao = chamadas.mock.calls
        .map(([params]) => params)
        .filter((params) => params.page_size === 100)
      expect(chamadasExportacao.map((params) => params.page)).toEqual([1, 2])
    } finally {
      HTMLAnchorElement.prototype.click = clickOriginal
      if (createObjectUrlOriginal) {
        Object.defineProperty(URL, 'createObjectURL', createObjectUrlOriginal)
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL')
      }
    }
  })

  it('indica quando mantém resultados antigos enquanto os novos filtros carregam', async () => {
    const todos = candidatosFixture as Candidatos
    const filtrados: Candidatos = {
      ...todos,
      items: todos.items.filter((item) => item.municipio === 'Jaboatão dos Guararapes'),
      total: 2,
    }
    let concluirConsulta!: (dados: Candidatos) => void

    vi.mocked(buscarCandidatos).mockImplementation((params: ParamsCandidatos) =>
      params.municipio
        ? new Promise<Candidatos>((resolve) => {
            concluirConsulta = resolve
          })
        : Promise.resolve(todos),
    )

    render(
      <MemoryRouter initialEntries={['/perdas/fila']}>
        <FilaPage />
      </MemoryRouter>,
    )

    await screen.findByText('UC-DEMO-001')
    fireEvent.change(screen.getByRole('combobox', { name: 'Município' }), {
      target: { value: 'Jaboatão dos Guararapes' },
    })

    await waitFor(() => expect(buscarCandidatos).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Atualizando resultados…')).toBeTruthy()
    expect(screen.getByRole('table').getAttribute('aria-busy')).toBe('true')

    await act(async () => concluirConsulta(filtrados))
    await waitFor(() => expect(screen.getByText('UC-DEMO-006')).toBeTruthy())
    expect(screen.queryByText('UC-DEMO-001')).toBeNull()
  })
})

describe('gerarCsvCandidatos', () => {
  it('exporta o score com uma casa decimal como texto', () => {
    const candidato = {
      ...(candidatosFixture as Candidatos).items[0],
      score: 66,
    }

    const csv = gerarCsvCandidatos([candidato])

    expect(csv).toContain('"Score (pontos)"')
    expect(csv).toContain('"66,0 pts"')
  })

  it('gera CSV UTF-8 com campos escapados e protege conteúdo que pode virar fórmula', () => {
    const candidato = {
      ...(candidatosFixture as Candidatos).items[0],
      id_uc: '=1+1',
      motivos: ['=HYPERLINK("https://example.test")', 'Leitura "suspeita"'],
    }

    const csv = gerarCsvCandidatos([candidato])

    expect(csv.startsWith('\uFEFF"Posição","UC"')).toBe(true)
    expect(csv).toContain('"\'=1+1"')
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"") | Leitura ""suspeita"""')
    expect(csv.endsWith('\r\n')).toBe(true)
  })
})
