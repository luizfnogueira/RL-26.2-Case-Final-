import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import candidatosFixture from '@/data/mocks/candidatos.json'
import { buscarCandidatos } from '@/services'
import type { Candidatos, ParamsCandidatos } from '@/types/inspecoes'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FilaPage from './FilaPage'

const mocks = vi.hoisted(() => ({
  buscarCandidatos: vi.fn(),
  criarInspecao: vi.fn(),
  normalizarErro: vi.fn(),
}))

vi.mock('@/services', () => mocks)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FilaPage', () => {
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
