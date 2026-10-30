import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buscarUnidade } from '@/services'
import { ApiError } from '@/services/erro-api'
import DetalheUnidade from './DetalheUnidade'

// Erros que o mock não produz: o serviço é substituído só neste arquivo.
const mocks = vi.hoisted(() => ({ buscarUnidade: vi.fn() }))
vi.mock('@/services', () => mocks)

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const abrir = () =>
  render(
    <MemoryRouter>
      <DetalheUnidade id="UC100015" />
    </MemoryRouter>,
  )

describe('detalhe da unidade: erros da API', () => {
  it('503 GOLD_NAO_CARREGADA explica que os dados não foram carregados e permite tentar de novo', async () => {
    const mensagem = 'Os dados da Gold ainda não foram carregados no banco.'
    vi.mocked(buscarUnidade).mockRejectedValue(new ApiError(503, 'GOLD_NAO_CARREGADA', mensagem))
    abrir()
    expect(await screen.findByRole('heading', { name: 'Dados ainda não carregados' })).toBeTruthy()
    expect(screen.getByText(mensagem)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(buscarUnidade).toHaveBeenCalledTimes(2))
  })

  it('outra falha usa o estado de erro genérico', async () => {
    vi.mocked(buscarUnidade).mockRejectedValue(
      new ApiError(500, 'ERRO_INTERNO', 'Falha inesperada.'),
    )
    abrir()
    expect(await screen.findByRole('heading', { name: 'Algo deu errado' })).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
