import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import exemplo from '@/data/mocks/resposta_ia.json'
import AppLayout from '@/layouts/AppLayout'
import { perguntarIA } from '@/services/ia'
import type { RespostaIA } from '@/types/ia'
import { paraCsv } from './csv'
import { SUGESTOES_POR_CATEGORIA } from './sugestoes'

// Tela 7 com os campos da sprint de GenAI: o POST /ia é substituído só neste arquivo.
vi.mock('@/services/ia', () => ({ perguntarIA: vi.fn() }))
const perguntar = vi.mocked(perguntarIA)

afterEach(() => {
  cleanup()
  perguntar.mockReset()
})

const base = () => structuredClone(exemplo) as RespostaIA

function abrirPainel() {
  const router = createMemoryRouter(
    [{ element: <AppLayout />, children: [{ path: '/painel', element: <p>Painel</p> }] }],
    { initialEntries: ['/painel'] },
  )
  render(<RouterProvider router={router} />)
  fireEvent.click(screen.getByRole('button', { name: 'Pergunte à IA' }))
  return screen.getByRole('complementary', { name: 'Assistente V-Energy' })
}

async function responder(resposta: RespostaIA, pergunta = 'Receita comercial por município?') {
  perguntar.mockResolvedValueOnce(resposta)
  const painel = abrirPainel()
  fireEvent.change(within(painel).getByLabelText('Sua pergunta'), { target: { value: pergunta } })
  fireEvent.click(within(painel).getByRole('button', { name: 'Enviar' }))
  await vi.waitFor(() => expect(within(painel).queryByRole('status')).toBeNull())
  return painel
}

describe('GENAI-15 — resposta em tabela', () => {
  const municipios = Array.from({ length: 12 }, (_, i) => [
    i === 0 ? 'JABOATÃO DOS GUARARAPES' : `MUNICIPIO ${String(i).padStart(2, '0')}`,
    1000 + i * 100.5,
    -2.09 + i,
  ])
  const tabela = (): RespostaIA => ({
    ...base(),
    apresentacao: 'tabela',
    dados: { colunas: ['municipio', 'receita_energia_brl', 'variacao_pct'], linhas: municipios },
  })

  it('mostra os dados como tabela no corpo, com unidades e nomes legíveis', async () => {
    const painel = await responder(tabela())
    const corpo = within(painel).getByRole('table', { name: 'Resposta do assistente em tabela' })
    expect(within(corpo).getByRole('button', { name: /Receita energia \(R\$\)/ })).toBeTruthy()
    expect(within(corpo).getByRole('button', { name: /Variacao \(%\)/ })).toBeTruthy()
    expect(within(corpo).getByText('Jaboatão dos Guararapes')).toBeTruthy()
    expect(within(corpo).getByText('R$ 1.000,00')).toBeTruthy()
    expect(within(corpo).getByText('−2,09%')).toBeTruthy()
    expect(within(corpo).getAllByRole('row')).toHaveLength(11) // cabeçalho + 10 por página
    expect(within(painel).getByText('1–10 de 12')).toBeTruthy()
    expect(within(painel).getByRole('button', { name: 'Exportar CSV' })).toBeTruthy()
  })

  it('ordena todas as linhas, não só a página', async () => {
    const painel = await responder(tabela())
    const corpo = within(painel).getByRole('table', { name: 'Resposta do assistente em tabela' })
    const ordenar = within(corpo).getByRole('button', { name: /Receita energia/ })
    fireEvent.click(ordenar) // crescente
    fireEvent.click(ordenar) // decrescente
    const primeira = within(corpo).getAllByRole('row')[1]
    expect(within(primeira).getByText('Municipio 11')).toBeTruthy()
  })

  it('resposta em texto não monta tabela no corpo', async () => {
    const painel = await responder({ ...base(), apresentacao: 'texto' })
    expect(
      within(painel).queryByRole('table', { name: 'Resposta do assistente em tabela' }),
    ).toBeNull()
  })

  it('CSV com ponto e vírgula, vírgula decimal e aspas quando precisa', () => {
    const csv = paraCsv({
      colunas: ['nome', 'valor'],
      linhas: [
        ['A; B', 1.5],
        [null, 2],
      ],
    })
    expect(csv.slice(1)).toBe('nome;valor\n"A; B";1,5\n;2')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })
})

describe('GENAI-18/19 — detalhes técnicos', () => {
  it('abre o painel com plano, ações, tokens, verificações e qualidade', async () => {
    const painel = await responder(base())
    fireEvent.click(within(painel).getByRole('button', { name: 'Detalhes técnicos' }))
    const botao = within(painel).getByRole('button', { name: 'Detalhes técnicos' })
    expect(botao.getAttribute('aria-expanded')).toBe('true')
    const detalhes = document.getElementById(botao.getAttribute('aria-controls')!)!
    expect(within(detalhes).getByText(/Qual foi a receita faturada \(com tributos\)/)).toBeTruthy()
    expect(within(detalhes).getByText('SUM')).toBeTruthy()
    expect(within(detalhes).getByText(/Justificativa declarada pelo modelo/)).toBeTruthy()
    expect(within(detalhes).getByText('1. consultar_gold')).toBeTruthy()
    expect(within(detalhes).getByText('1840 de entrada · 212 de saída')).toBeTruthy()
    expect(within(detalhes).getByText('2,4 s')).toBeTruthy()
    expect(within(detalhes).getByText('Acurácia de execução')).toBeTruthy()
    expect(within(detalhes).getByText('85%')).toBeTruthy()
    expect(within(detalhes).getByRole('table', { name: /por status/ })).toBeTruthy()
    // Não sei correto = recall do status nao_sei (0,89 no exemplo)
    const naoSei = within(detalhes).getByText('Não sei correto')
    expect(naoSei.nextElementSibling?.textContent).toBe('89%')
  })

  it('uma aba aberta por vez', async () => {
    const painel = await responder(base())
    const como = within(painel).getByRole('button', { name: 'Como cheguei nisso' })
    const detalhes = within(painel).getByRole('button', { name: 'Detalhes técnicos' })
    fireEvent.click(como)
    fireEvent.click(detalhes)
    expect(como.getAttribute('aria-expanded')).toBe('false')
    expect(detalhes.getAttribute('aria-expanded')).toBe('true')
  })

  it('sem avaliação ainda, o bloco de qualidade avisa', async () => {
    const resposta = base()
    resposta.detalhes_tecnicos!.avaliacao = null
    const painel = await responder(resposta)
    fireEvent.click(within(painel).getByRole('button', { name: 'Detalhes técnicos' }))
    expect(within(painel).getByText('Ainda não há avaliação do agente.')).toBeTruthy()
  })

  it('"não sei" também mostra os detalhes técnicos', async () => {
    const painel = await responder({
      ...base(),
      status: 'nao_sei',
      sql: null,
      tabelas: [],
      dados: { colunas: [], linhas: [] },
    })
    expect(within(painel).getByRole('button', { name: 'Detalhes técnicos' })).toBeTruthy()
    expect(within(painel).queryByRole('button', { name: 'Como cheguei nisso' })).toBeNull()
  })

  it('resposta antiga, sem detalhes técnicos, não mostra o botão', async () => {
    const painel = await responder({ ...base(), detalhes_tecnicos: undefined })
    expect(within(painel).queryByRole('button', { name: 'Detalhes técnicos' })).toBeNull()
  })

  it('renderiza tudo como texto: <img onerror> não vira HTML (GENAI-18.5, 28.4)', async () => {
    const ataque = '<img src=x onerror="window.__xss=1">'
    const resposta = base()
    resposta.resposta = `Receita ${ataque}`
    resposta.sql = `SELECT '${ataque}'`
    resposta.apresentacao = 'tabela'
    resposta.dados = {
      colunas: ['municipio', 'valor'],
      linhas: [
        [ataque, 1],
        ['B', 2],
      ],
    }
    const detalhes = resposta.detalhes_tecnicos!
    detalhes.estrutura_pensamento.pergunta_interpretada = ataque
    detalhes.estrutura_pensamento.premissas = [ataque]
    detalhes.estrutura_pensamento.justificativa = ataque
    detalhes.acoes[0].resumo_retorno = ataque
    const painel = await responder(resposta)
    fireEvent.click(within(painel).getByRole('button', { name: 'Detalhes técnicos' }))
    fireEvent.click(within(painel).getByRole('button', { name: 'Como cheguei nisso' }))
    expect(document.querySelector('img')).toBeNull()
    expect(within(painel).getAllByText(ataque, { exact: false }).length).toBeGreaterThan(1)
    expect((window as { __xss?: number }).__xss).toBeUndefined()
  })
})

describe('GENAI-16 — aba de sugestões', () => {
  const todas = SUGESTOES_POR_CATEGORIA.flatMap((c) => c.perguntas)

  it('tem de 12 a 16 perguntas em 5 categorias, com as 3 do case', () => {
    expect(SUGESTOES_POR_CATEGORIA).toHaveLength(5)
    expect(todas.length).toBeGreaterThanOrEqual(12)
    expect(todas.length).toBeLessThanOrEqual(16)
    expect(todas).toEqual(
      expect.arrayContaining([
        'Quantas unidades com painel solar em Olinda tiveram queda de consumo acima de 30%?',
        'Qual bairro mais perdeu volume residencial no último ano?',
        'Quanto a receita comercial cresceu em Jaboatão?',
      ]),
    )
  })

  it('a aba lista as sugestões por categoria e o clique envia a pergunta', async () => {
    perguntar.mockResolvedValueOnce(base())
    const painel = abrirPainel()
    const aba = within(painel).getByRole('tab', { name: 'Sugestões' })
    fireEvent.click(aba)
    expect(aba.getAttribute('aria-selected')).toBe('true')
    for (const { categoria, perguntas } of SUGESTOES_POR_CATEGORIA) {
      const lista = within(painel).getByRole('list', { name: categoria })
      expect(within(lista).getAllByRole('button')).toHaveLength(perguntas.length)
    }
    expect(within(painel).getByRole('button', { name: /Testar "Não sei"/ })).toBeTruthy()

    fireEvent.click(
      within(painel).getByRole('button', {
        name: 'Qual canal de atendimento tem a pior nota de satisfação?',
      }),
    )
    expect(perguntar.mock.calls[0][0]).toBe(
      'Qual canal de atendimento tem a pior nota de satisfação?',
    )
    expect(
      within(painel).getByRole('tab', { name: 'Conversa' }).getAttribute('aria-selected'),
    ).toBe('true')
  })
})
