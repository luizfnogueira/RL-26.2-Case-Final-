import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import unidadeFixture from '@/data/mocks/unidade.json'
import UnidadePage from '@/pages/UnidadePage'
import type { DiagnosticoConta } from '@/types/unidades'
import BlocoDiagnostico from './BlocoDiagnostico'
import { rotuloModalidadeGd } from './rotulos'

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
    expect(await screen.findByRole('heading', { name: 'Titular de exemplo 007' })).toBeTruthy()
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

describe('detalhe da unidade (/unidades/:id)', () => {
  it('mostra o cabeçalho, o cadastro, o medidor e a GD da UC completa', async () => {
    abrir('/unidades/UC-DEMO-001')
    expect(await screen.findByRole('heading', { name: 'Titular de exemplo 001' })).toBeTruthy()
    expect(screen.getByText(/Período analisado: Jul\/2025 – Jun\/2026/)).toBeTruthy()
    expect(screen.getByText(/dado fictício/i)).toBeTruthy()

    const cadastro = within(screen.getByRole('region', { name: 'Cadastro' }))
    expect(cadastro.getByText('***.456.789-**')).toBeTruthy()
    expect(cadastro.queryByText('Telefone')).toBeNull() // sem fonte na Gold: campo não exibido
    expect(cadastro.getByText('Rua de Exemplo, 100 · Boa Vista, Recife – PE')).toBeTruthy()
    expect(cadastro.getByText('12/03/2018')).toBeTruthy() // data sem passar por fuso
    expect(cadastro.getByText('00000-000')).toBeTruthy() // CEP com máscara

    const medidor = within(screen.getByRole('region', { name: 'Medidor' }))
    expect(medidor.getByText('18.452 kWh em 28/06/2026')).toBeTruthy() // valor exato
    expect(medidor.getByText('Estimada')).toBeTruthy()

    const gd = within(screen.getByRole('region', { name: 'Geração distribuída' }))
    expect(gd.getByText('5,0 kWp')).toBeTruthy()
    expect(gd.getByText('Geração na própria UC')).toBeTruthy()
  })

  it('rótulo da modalidade de GD para as 3 da Gold; valor desconhecido aparece como veio', () => {
    expect(rotuloModalidadeGd('GERACAO NA PROPRIA UC')).toBe('Geração na própria UC')
    expect(rotuloModalidadeGd('AUTOCONSUMO REMOTO')).toBe('Autoconsumo remoto')
    expect(rotuloModalidadeGd('GERACAO COMPARTILHADA')).toBe('Geração compartilhada')
    expect(rotuloModalidadeGd('MODALIDADE NOVA')).toBe('MODALIDADE NOVA')
    expect(rotuloModalidadeGd('toString')).toBe('toString')
  })

  it('UC sem GD mostra o estado próprio do bloco', async () => {
    abrir('/unidades/UC-DEMO-007')
    expect(await screen.findByRole('heading', { name: 'Sem geração distribuída' })).toBeTruthy()
  })

  it('UC inexistente mostra "UC não encontrada" com volta para a busca', async () => {
    const { caminho } = abrir('/unidades/UC-DEMO-002')
    expect(await screen.findByRole('heading', { name: 'UC não encontrada' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull() // não é erro
    fireEvent.click(screen.getByRole('link', { name: 'Voltar para a busca' }))
    expect(caminho()).toBe('/unidades')
  })
})

describe('diagnóstico "a conta veio alta?"', () => {
  const bloco = () => within(screen.getByRole('region', { name: 'A conta veio alta?' }))

  it('UC com consumo acima do ano anterior: selo, veredito, os 4 números e o alerta', async () => {
    abrir('/unidades/UC-DEMO-001')
    await screen.findByRole('heading', { name: 'Titular de exemplo 001' })
    const d = bloco()
    expect(d.getByText('Mês analisado: Jun/2026')).toBeTruthy()
    expect(d.getByText('Consumo subiu')).toBeTruthy() // o selo mede consumo, não a conta
    expect(d.queryByText('Conta alta')).toBeNull()
    expect(d.getByText('Leitura estimada')).toBeTruthy()
    expect(d.getByText(/^Consumo subiu: jun\/2026/)).toBeTruthy()
    expect(d.getByText('412 kWh')).toBeTruthy()
    expect(d.getByText('298 kWh')).toBeTruthy()
    expect(d.getByText('323 kWh')).toBeTruthy() // média 322,83
    expect(d.getByText('12 de 12 meses · Jun/2025 – Mai/2026')).toBeTruthy()
    expect(d.getByText('+38,3%')).toBeTruthy()
    expect(d.getByText(/^Leitura ESTIMADA em jun\/2026/)).toBeTruthy()
  })

  it('UC recente: sem ano anterior, os ausentes viram travessão e a média mostra a base curta', async () => {
    abrir('/unidades/UC-DEMO-007')
    await screen.findByRole('heading', { name: 'Titular de exemplo 007' })
    const d = bloco()
    expect(d.getByText('Sem comparação com o ano anterior')).toBeTruthy()
    expect(d.getAllByText('—')).toHaveLength(2) // ano anterior e variação: nunca 0
    expect(d.getByText('5 de 12 meses · Jun/2025 – Mai/2026')).toBeTruthy()
    expect(d.getByText(/média dos meses anteriores \(5 meses\)/)).toBeTruthy()
  })

  it('janela sem dados da UC mostra o estado próprio, sem números vazios', () => {
    const vazio: DiagnosticoConta = {
      ...(unidadeFixture.diagnostico_conta as DiagnosticoConta),
      periodo_referencia: null,
      veredito: null,
      conta_alta: null,
    }
    render(<BlocoDiagnostico diagnostico={vazio} />)
    expect(screen.getByRole('heading', { name: 'Sem consumo nesta janela' })).toBeTruthy()
    expect(screen.queryByText('Último mês')).toBeNull()
  })
})
