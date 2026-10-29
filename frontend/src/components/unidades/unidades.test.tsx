import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import UnidadePage from '@/pages/UnidadePage'

afterEach(cleanup)

function Local({ aoLer }: { aoLer: (caminho: string) => void }) {
  const { pathname, search } = useLocation()
  aoLer(pathname + search)
  return null
}

/** Abre a tela no mock (VITE_USE_MOCKS=true nos testes) e devolve o caminho atual. */
function abrir(url = '/unidades') {
  let caminho = ''
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/unidades" element={<UnidadePage />} />
        <Route path="/unidades/:id" element={<UnidadePage />} />
      </Routes>
      <Local aoLer={(c) => (caminho = c)} />
    </MemoryRouter>,
  )
  return { caminho: () => caminho }
}

function buscar(termo: string) {
  fireEvent.change(screen.getByLabelText('Código da UC ou nome do titular'), {
    target: { value: termo },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
}

const linhasDaTabela = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((linha) => within(linha).getAllByRole('cell')[0].textContent)

describe('busca de unidades (/unidades)', () => {
  it('começa convidando a buscar, sem consultar a API', () => {
    abrir()
    expect(screen.getByRole('heading', { name: 'Busque uma unidade consumidora' })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('exige ao menos 3 caracteres e não muda a URL', () => {
    const { caminho } = abrir()
    buscar(' ab ')
    expect(screen.getByText('Digite ao menos 3 caracteres.')).toBeTruthy()
    expect(caminho()).toBe('/unidades')
  })

  it('lista o resultado, guarda a busca na URL e abre o detalhe ao clicar na linha', async () => {
    const { caminho } = abrir()
    buscar('titular')
    expect(await screen.findByText('5 unidades encontradas para “titular”')).toBeTruthy()
    expect(caminho()).toBe('/unidades?busca=titular')
    expect(linhasDaTabela()).toEqual([
      'UC-DEMO-001',
      'UC-DEMO-003',
      'UC-DEMO-005',
      'UC-DEMO-007',
      'UC-DEMO-008',
    ])
    expect(screen.getByText('Casa Caiada')).toBeTruthy() // nome formatado só para exibir
    fireEvent.click(screen.getByText('UC-DEMO-005'))
    expect(caminho()).toBe('/unidades/UC-DEMO-005')
  })

  it('com o código completo e um único resultado, vai direto para o detalhe', async () => {
    const { caminho } = abrir()
    buscar('uc-demo-007')
    expect(await screen.findByText(/Visão 360 da unidade UC-DEMO-007/)).toBeTruthy()
    expect(caminho()).toBe('/unidades/UC-DEMO-007')
  })

  it('código parcial com vários resultados continua na lista', async () => {
    const { caminho } = abrir()
    buscar('UC-DEMO-00')
    expect(await screen.findByText('8 unidades encontradas para “UC-DEMO-00”')).toBeTruthy()
    expect(caminho()).toBe('/unidades?busca=UC-DEMO-00')
  })

  it('voltar para a URL de um código completo mostra a lista, sem redirecionar de novo', async () => {
    const { caminho } = abrir('/unidades?busca=UC-DEMO-007')
    expect(await screen.findByText('1 unidade encontrada para “UC-DEMO-007”')).toBeTruthy()
    expect(caminho()).toBe('/unidades?busca=UC-DEMO-007')
    expect(
      (screen.getByLabelText('Código da UC ou nome do titular') as HTMLInputElement).value,
    ).toBe('UC-DEMO-007')
  })

  it('sem resultado mostra o estado vazio', async () => {
    abrir()
    buscar('inexistente')
    expect(await screen.findByRole('heading', { name: 'Nenhuma unidade encontrada' })).toBeTruthy()
  })

  it('marca os dados do mock como fictícios', async () => {
    abrir('/unidades?busca=titular')
    await screen.findByText('5 unidades encontradas para “titular”')
    expect(screen.getByText(/dado fictício/i)).toBeTruthy()
  })
})
