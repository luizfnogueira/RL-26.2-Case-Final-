import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Cascata from '@/components/graficos/Cascata'
import {
  calcularBarras,
  marcasDoEixo,
  quebrarRotulo,
  tetoDoEixo,
  type EtapaCascata,
} from '@/components/graficos/geometria'
import ReceitaPage from '@/pages/ReceitaPage'
import { buscarDashboard } from '@/services'
import { reiniciarOrdens } from '@/services/mock'
import { formatarReais, formatarReaisCompleto } from '@/utils/formatacao'
import { etapasDaPonte, explicarResultado, numerosDoInsight, variacaoDaReceita } from './explicacao'

afterEach(cleanup)
beforeEach(() => reiniciarOrdens())

const ATUAL = '2025-07/2026-06'
const COMPARACAO = '2022-07/2023-06'
const consolidado = () => buscarDashboard({ periodo_atual: ATUAL, periodo_comparacao: COMPARACAO })

describe('geometria da cascata', () => {
  const etapas: EtapaCascata[] = [
    { id: 'a', rotulo: 'Base', valor: 100, tipo: 'total' },
    { id: 'b', rotulo: 'Sobe', valor: 30, tipo: 'variacao' },
    { id: 'c', rotulo: 'Cai', valor: -50, tipo: 'variacao' },
    { id: 'd', rotulo: 'Atual', valor: 80, tipo: 'total' },
  ]

  it('totais saem do zero e variações flutuam sobre o acumulado', () => {
    const barras = calcularBarras(etapas)
    expect(barras.map((b) => [b.de, b.ate])).toEqual([
      [0, 100],
      [100, 130],
      [80, 130],
      [0, 80],
    ])
    expect(barras.map((b) => b.acumulado)).toEqual([100, 130, 80, 80])
  })

  it('arredonda o teto do eixo e quebra rótulos sem cortar palavras', () => {
    expect(tetoDoEixo(222.4)).toBe(250)
    expect(tetoDoEixo(0)).toBe(1)
    expect(marcasDoEixo(250)).toEqual([0, 62.5, 125, 187.5, 250])
    expect(quebrarRotulo('Receita de energia base', 14)).toEqual(['Receita de', 'energia base'])
    expect(quebrarRotulo('Efeito-preço', 14)).toEqual(['Efeito-preço'])
  })
})

describe('Cascata', () => {
  const etapas: EtapaCascata[] = [
    { id: 'base', rotulo: 'Receita base', valor: 205_900_000, tipo: 'total' },
    { id: 'preco', rotulo: 'Efeito-preço', valor: 24_700_000, tipo: 'variacao' },
    { id: 'volume', rotulo: 'Efeito-volume', valor: -8_200_000, tipo: 'variacao' },
    { id: 'atual', rotulo: 'Receita atual', valor: 222_400_000, tipo: 'total' },
  ]
  const renderizar = () =>
    render(
      <Cascata
        etapas={etapas}
        formatarValor={(v, e) => formatarReais(v, { sinal: e?.tipo === 'variacao' })}
        formatarValorCompleto={formatarReaisCompleto}
        descricao="Ponte da receita"
      />,
    )

  it('desenha uma barra acessível por etapa, com o valor sinalizado', () => {
    renderizar()
    const barras = screen.getAllByRole('img')
    expect(barras).toHaveLength(4)
    expect(barras[2].getAttribute('aria-label')).toBe('Efeito-volume: −R$ 8.200.000,00')
    expect(screen.getByText('+R$ 24,7 mi')).toBeTruthy()
    expect(screen.getByText('−R$ 8,2 mi')).toBeTruthy()
  })

  it('mostra o tooltip ao focar a barra e some ao sair', () => {
    renderizar()
    expect(screen.queryByRole('status')).toBeNull()
    const barra = screen.getAllByRole('img')[1]
    fireEvent.focus(barra)
    expect(screen.getByRole('status').textContent).toContain('+R$ 24.700.000,00')
    fireEvent.blur(barra)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('alterna para a visão em tabela com todos os valores', () => {
    renderizar()
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    const linhas = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(linhas.map((l) => l.textContent)).toEqual([
      'Receita baseR$ 205.900.000,00',
      'Efeito-preço+R$ 24.700.000,00',
      'Efeito-volume−R$ 8.200.000,00',
      'Receita atualR$ 222.400.000,00',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Ver gráfico' }))
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('explicação e números do insight', () => {
  it('a ponte do consolidado fecha e gera as quatro etapas', async () => {
    const dashboard = await consolidado()
    const etapas = etapasDaPonte(dashboard)
    expect(etapas?.map((e) => e.id)).toEqual(['base', 'preco', 'volume', 'atual'])
    const [base, preco, volume, atual] = (etapas ?? []).map((e) => e.valor)
    expect(base + preco + volume).toBeCloseTo(atual, 1)
    expect(variacaoDaReceita(dashboard)).toBeCloseTo(((atual - base) / base) * 100, 6)
  })

  it('monta três pontos a partir dos números da API, sem inventar', async () => {
    const pontos = explicarResultado(await consolidado())
    expect(pontos.map((p) => p.id)).toEqual(['motor', 'volume', 'resultado'])
    expect(pontos[0].titulo).toBe('Preço foi o principal motor')
    expect(pontos[0].texto).toContain('+R$ 24,7 mi')
    expect(pontos[1].titulo).toBe('Volume pressionou o resultado')
    expect(pontos[1].texto).toContain('−R$ 8,2 mi')
    expect(pontos[2].texto).toContain('O crescimento veio do preço, não de mais consumo.')
  })

  it('manda os seis números nomeados como a API espera e não explica sem decomposição', async () => {
    const dashboard = await consolidado()
    expect(numerosDoInsight(dashboard)?.map((n) => n.nome)).toEqual([
      'receita_energia_atual',
      'receita_energia_comparacao',
      'variacao_volume',
      'reajuste',
      'efeito_preco',
      'efeito_volume',
    ])
    dashboard.ponte_receita.efeito_preco.valor = null
    expect(numerosDoInsight(dashboard)).toBeNull()
    expect(etapasDaPonte(dashboard)).toBeNull()
    expect(explicarResultado(dashboard)).toEqual([])
  })
})

function Local({ aoLer }: { aoLer: (busca: string) => void }) {
  aoLer(useLocation().search)
  return null
}

describe('ReceitaPage (com mocks)', () => {
  const abrir = (url = '/receita') => {
    let busca = ''
    render(
      <MemoryRouter initialEntries={[url]}>
        <ReceitaPage />
        <Local aoLer={(b) => (busca = b)} />
      </MemoryRouter>,
    )
    return { busca: () => busca }
  }

  it('mostra a análise da IA, a ponte, a explicação e o drill-down por município', async () => {
    abrir()
    expect(await screen.findByRole('heading', { name: 'Por que a receita mudou?' })).toBeTruthy()
    expect(screen.getByText('Gerado por IA')).toBeTruthy()
    expect(screen.getAllByText('Dado fictício').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Ponte da receita' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Preço foi o principal motor' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Município' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Recife' })).toBeTruthy()
    // Sem tributos: a tela avisa que difere da receita faturada.
    expect(screen.getByText(/Receita de energia, sem tributos/)).toBeTruthy()
  })

  it('lista os seis números usados pela IA ao expandir', async () => {
    abrir()
    const botao = await screen.findByRole('button', { name: /Ver os 6 números utilizados/ })
    const lista = screen.getByLabelText('Números utilizados na análise', { selector: 'ul' })
    expect(lista.hasAttribute('hidden')).toBe(true)
    fireEvent.click(botao)
    expect(lista.hasAttribute('hidden')).toBe(false)
    expect(within(lista).getAllByRole('listitem')).toHaveLength(6)
    expect(within(lista).getByText('R$ 222,4 mi')).toBeTruthy()
  })

  it('desce no drill-down pela URL e volta pelo breadcrumb removendo os filtros descendentes', async () => {
    const { busca } = abrir()
    fireEvent.click(await screen.findByRole('cell', { name: 'Recife' }))
    expect(await screen.findByRole('columnheader', { name: 'Bairro' })).toBeTruthy()
    expect(busca()).toBe('?municipio=Recife')

    fireEvent.click(await screen.findByRole('cell', { name: 'Boa Viagem' }))
    expect(await screen.findByRole('columnheader', { name: 'Classe' })).toBeTruthy()
    expect(busca()).toContain('bairro=Boa+Viagem')
    // Último nível: as linhas não descem mais.
    expect(screen.getAllByRole('row')[1].getAttribute('tabindex')).toBeNull()

    const caminho = screen.getByRole('navigation', { name: 'Caminho do drill-down' })
    fireEvent.click(within(caminho).getByRole('button', { name: 'Recife' }))
    expect(await screen.findByRole('columnheader', { name: 'Bairro' })).toBeTruthy()
    expect(busca()).toBe('?municipio=Recife')

    fireEvent.click(within(caminho).getByRole('button', { name: 'Todos os municípios' }))
    expect(await screen.findByRole('columnheader', { name: 'Município' })).toBeTruthy()
    expect(busca()).toBe('')
  })

  it('abre já filtrada quando a URL traz município e bairro (recarregar mantém)', async () => {
    abrir('/receita?municipio=Olinda&bairro=Rio+Doce')
    expect(await screen.findByRole('columnheader', { name: 'Classe' })).toBeTruthy()
    expect((screen.getByLabelText('Município') as HTMLSelectElement).value).toBe('Olinda')
    expect((screen.getByLabelText('Bairro') as HTMLSelectElement).value).toBe('Rio Doce')
    expect(await screen.findByText(/Em Olinda \/ Rio Doce/)).toBeTruthy()
  })

  it('período fora do cenário vira estado de erro com a mensagem da API e nova tentativa', async () => {
    abrir('/receita?periodo_atual=2024-07/2025-06')
    const alerta = await screen.findByRole('alert')
    await waitFor(() => expect(alerta.textContent).toContain('CENARIO_STUB_INDISPONIVEL'))
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})
