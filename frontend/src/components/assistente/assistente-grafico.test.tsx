import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import exemploBarras from '@/data/mocks/resposta_ia_grafico_barras.json'
import exemploLinhas from '@/data/mocks/resposta_ia_grafico_linhas.json'
import exemploPizza from '@/data/mocks/resposta_ia_grafico_pizza.json'
import AppLayout from '@/layouts/AppLayout'
import { perguntarIA } from '@/services/ia'
import { responderPergunta } from '@/services/mock/ia'
import type { GraficoIA, RespostaIA } from '@/types/ia'
import GraficoResposta from './GraficoResposta'

// Gráfico na conversa (contrato, seção 9): o backend escolhe o tipo; aqui só se desenha.
vi.mock('@/services/ia', () => ({ perguntarIA: vi.fn() }))
const perguntar = vi.mocked(perguntarIA)

afterEach(() => {
  cleanup()
  perguntar.mockReset()
})

const resposta = (exemplo: unknown) => structuredClone(exemplo) as RespostaIA

function desenhar(r: RespostaIA, grafico: Partial<GraficoIA> = {}) {
  render(<GraficoResposta grafico={{ ...(r.grafico as GraficoIA), ...grafico }} dados={r.dados} />)
  return screen.getByRole('figure')
}

const rotulos = (figura: HTMLElement) =>
  within(figura)
    .getAllByRole('img')
    .map((el) => el.getAttribute('aria-label'))

describe('barras', () => {
  it('desenha P1 e P2 lado a lado por classe, na ordem do backend, com valor e legenda', () => {
    const figura = desenhar(resposta(exemploBarras))
    expect(within(figura).getByText(/Receita de energia \(sem tributos\) por classe/)).toBeTruthy()
    const barras = rotulos(figura)
    expect(barras).toHaveLength(5)
    expect(barras[0]).toBe('Residencial: P1 R$ 98.400.000,00, P2 R$ 104.100.000,00')
    expect(barras[4]).toMatch(/^Poder Publico:/)
    expect(within(figura).getByText('R$ 104,1 mi')).toBeTruthy()
    expect(within(figura).getAllByText('P1').length).toBeGreaterThan(0) // legenda
  })

  it('valor negativo fica à esquerda da barra sem cobrir o nome da categoria', () => {
    // Caso real: efeito preço (+) e efeito volume (−); "−R$ 5,0 mi" caía em cima de "Efeito Volume"
    const figura = desenhar(resposta(exemploBarras), {
      categorias: ['Efeito Preço', 'Efeito Volume'],
      series: [{ nome: 'Valor', valores: [14425857.02, -4993655.75] }],
      eixo: 'categoria',
    })
    const textos = [...figura.querySelectorAll('text')]
    const nome = textos.find((t) => t.textContent === 'Efeito Volume') as SVGTextElement
    const valor = textos.find((t) => t.textContent?.includes('5,0 mi')) as SVGTextElement
    const larguraDoValor = (valor.textContent ?? '').length * 6.6
    expect(Number(valor.getAttribute('x')) - larguraDoValor).toBeGreaterThan(Number(nome.getAttribute('x')))
  })

  it('barras agrupadas afastam as barras para os valores não se encostarem', () => {
    // Caso real: receita total e receita de energia em P1 e P2; "R$ 117,8 mi" cobria a barra vizinha
    const figura = desenhar(resposta(exemploBarras), {
      orientacao: 'vertical',
      eixo: 'periodo',
      categorias: ['P1', 'P2'],
      series: [
        { nome: 'Receita total', valores: [157107191.43, 169683458.59] },
        { nome: 'Receita energia', valores: [117830394.38, 127300000] },
      ],
    })
    const valores = [...figura.querySelectorAll('text')].filter((t) => t.textContent?.startsWith('R$'))
    const [total, energia] = valores.slice(0, 2).map((t) => Number(t.getAttribute('x')))
    const larguraDoTexto = (valores[0].textContent ?? '').length * 6.6
    expect(energia - total).toBeGreaterThanOrEqual(larguraDoTexto)
  })

  it('não arredonda os cantos e sai do zero', () => {
    const figura = desenhar(resposta(exemploBarras))
    const retangulos = [...figura.querySelectorAll('rect[class*="fill-"]')]
    expect(retangulos.length).toBe(10)
    expect(retangulos.every((r) => !r.getAttribute('rx'))).toBe(true)
  })
})

describe('pizza', () => {
  it('mostra até 5 fatias com percentual, "Outros" por último e o total no centro', () => {
    const r = resposta(exemploPizza)
    const valores = (r.grafico as GraficoIA).series[0].valores as number[]
    const total = valores.reduce((a, b) => a + b, 0)
    const figura = desenhar(r)
    const fatias = rotulos(figura)
    expect(fatias).toHaveLength(5)
    const pct = (v: number) => `${((v / total) * 100).toFixed(1).replace('.', ',')}%`
    expect(fatias[0]).toBe(`Residencial: ${pct(valores[0])} (R$ 104.100.000,00)`)
    expect(fatias[4]).toMatch(/^Outros:/)
    expect(within(figura).getByText('Total')).toBeTruthy()
    expect(within(figura).getByText('R$ 217,0 mi')).toBeTruthy()
  })
})

describe('linhas', () => {
  it('liga os meses da esquerda para a direita, com rótulo de mês legível', () => {
    const figura = desenhar(resposta(exemploLinhas))
    const caminho = figura.querySelector('path')?.getAttribute('d') ?? ''
    expect(caminho.match(/M/g)).toHaveLength(1)
    expect(caminho.match(/L/g)).toHaveLength(11)
    expect(within(figura).getByText('Jul/2025')).toBeTruthy()
    expect(rotulos(figura)[0]).toBe('Jul/2025: R$ 23.100.000,00')
  })

  it('mês sem dado vira buraco na linha, não é ligado', () => {
    const r = resposta(exemploLinhas)
    const grafico = r.grafico as GraficoIA
    const valores = [...grafico.series[0].valores]
    valores[5] = null
    const figura = desenhar(r, { series: [{ ...grafico.series[0], valores }] })
    const caminho = figura.querySelector('path')?.getAttribute('d') ?? ''
    expect(caminho.match(/M/g)).toHaveLength(2)
    expect(rotulos(figura)[5]).toBe('Dez/2025: sem dado')
  })
})

describe('tabela, notas e segurança', () => {
  it('"Ver como tabela" mostra os valores completos para leitor de tela', () => {
    const figura = desenhar(resposta(exemploBarras))
    fireEvent.click(within(figura).getByRole('button', { name: 'Ver como tabela' }))
    const tabela = within(figura).getByRole('table')
    expect(within(tabela).getAllByRole('row')).toHaveLength(6)
    expect(within(tabela).getByText('R$ 104.100.000,00')).toBeTruthy()
    expect(within(figura).getByRole('button', { name: 'Ver gráfico' })).toBeTruthy()
  })

  it('"Ver como tabela" mostra a resposta inteira, inclusive a coluna que ficou fora do gráfico', () => {
    // Caso real: receita (R$) e consumo (kWh) por município; o consumo não cabe no eixo em R$
    const r = resposta(exemploBarras)
    r.dados = {
      colunas: [...r.dados.colunas, 'consumo_kwh'],
      linhas: r.dados.linhas.map((linha, i) => [...linha, 1000 * (i + 1)]),
    }
    const figura = desenhar(r)
    fireEvent.click(within(figura).getByRole('button', { name: 'Ver como tabela' }))
    const tabela = within(figura).getByRole('table')
    expect(within(tabela).getByText('Consumo (kWh)')).toBeTruthy()
    expect(within(tabela).getByText('1.000 kWh')).toBeTruthy()
  })

  it('mostra a nota do backend antes do gráfico', () => {
    const nota = 'O gráfico mostra os 4 municípios de maior valor; os outros 10 estão em “Ver como tabela”.'
    const figura = desenhar(resposta(exemploBarras), { nota, omitidos: 10 })
    const aviso = within(figura).getByText(nota)
    expect(aviso.compareDocumentPosition(within(figura).getAllByRole('img')[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sem nota, diz quantos itens ficaram de fora', () => {
    const figura = desenhar(resposta(exemploBarras), { nota: null, omitidos: 3 })
    expect(within(figura).getByText(/Mais 3 itens ficaram de fora do gráfico; estão em “Ver como tabela”/)).toBeTruthy()
  })

  it('rótulo vindo da resposta é texto, nunca HTML', () => {
    const ataque = '<img src=x onerror=alert(1)>'
    const r = resposta(exemploBarras)
    const grafico = r.grafico as GraficoIA
    const figura = desenhar(r, { titulo: ataque, categorias: [ataque, ...grafico.categorias.slice(1)] })
    expect(figura.querySelector('img')).toBeNull()
    expect(within(figura).getByText(ataque)).toBeTruthy()
  })
})

describe('na conversa', () => {
  it('a resposta com apresentacao "grafico" aparece como gráfico no painel', async () => {
    perguntar.mockResolvedValueOnce(resposta(exemploPizza))
    const router = createMemoryRouter(
      [{ element: <AppLayout />, children: [{ path: '/painel', element: <p>Painel</p> }] }],
      { initialEntries: ['/painel'] },
    )
    render(<RouterProvider router={router} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pergunte à IA' }))
    const painel = screen.getByRole('complementary', { name: 'Assistente V-Energy' })
    fireEvent.change(within(painel).getByLabelText('Sua pergunta'), {
      target: { value: 'Gráfico de pizza da receita por classe' },
    })
    fireEvent.click(within(painel).getByRole('button', { name: 'Enviar' }))
    await vi.waitFor(() => expect(within(painel).getByRole('figure')).toBeTruthy())
    expect(within(painel).queryByRole('table', { name: 'Resposta do assistente em tabela' })).toBeNull()
  })

  it.each([
    ['Faça um gráfico de pizza da receita', 'pizza'],
    ['gráfico de linhas da receita mês a mês', 'linhas'],
    ['Mostre um gráfico de barras', 'barras'],
  ])('o mock do front responde "%s" com um gráfico de %s', async (pergunta, tipo) => {
    const r = await responderPergunta({ pergunta })
    expect(r.apresentacao).toBe('grafico')
    expect(r.grafico?.tipo).toBe(tipo)
  })
})
