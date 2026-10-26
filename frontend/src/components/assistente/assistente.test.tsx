import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import AppLayout from '@/layouts/AppLayout'
import AssistentePage from '@/pages/AssistentePage'
import { PERGUNTAS_DE_TESTE, PERGUNTAS_SUGERIDAS } from './sugestoes'

afterEach(cleanup)

function abrirPortal(inicio = '/painel') {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { path: '/painel', element: <p>Conteúdo do painel executivo</p> },
          { path: '/receita', element: <p>Conteúdo do diagnóstico da receita</p> },
          { path: '/assistente', element: <AssistentePage /> },
        ],
      },
    ],
    { initialEntries: [inicio] },
  )
  render(<RouterProvider router={router} />)
  return router
}

function abrirPainel() {
  fireEvent.click(screen.getByRole('button', { name: 'Pergunte à IA' }))
  return screen.getByRole('complementary', { name: 'Assistente V-Energy' })
}

function escrever(painel: HTMLElement, texto: string) {
  fireEvent.change(within(painel).getByLabelText('Sua pergunta'), { target: { value: texto } })
}

describe('Tela 7 — painel do Assistente', () => {
  it('abre pelo botão flutuante sem sair da tela, com aviso de somente leitura e sugestões', () => {
    abrirPortal()
    const painel = abrirPainel()
    expect(screen.getByText('Conteúdo do painel executivo')).toBeTruthy()
    expect(within(painel).getByText(/Assistente somente leitura/)).toBeTruthy()
    const sugestoes = within(painel).getByRole('list', { name: 'Perguntas sugeridas' })
    expect(
      within(sugestoes)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(PERGUNTAS_SUGERIDAS)
    expect(PERGUNTAS_SUGERIDAS.some((p) => p.includes('conta de luz'))).toBe(true)
    expect(PERGUNTAS_SUGERIDAS.some((p) => p.includes('falta de luz'))).toBe(true)
    expect(document.activeElement).toBe(within(painel).getByLabelText('Sua pergunta'))
  })

  it('responde a sugestão com o bloco "Como cheguei nisso" (SQL, tabelas e minitabela)', async () => {
    abrirPortal()
    const painel = abrirPainel()
    fireEvent.click(
      within(painel).getByRole('button', { name: 'Por que a conta de luz aumentou?' }),
    )
    expect(within(painel).getByText('Por que a conta de luz aumentou?')).toBeTruthy()
    expect(await within(painel).findByText(/receita de energia passou/i)).toBeTruthy()

    const botao = within(painel).getByRole('button', { name: 'Como cheguei nisso' })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(within(painel).queryByText(/SELECT efeito, valor_brl/)).toBeNull()

    fireEvent.click(botao)
    expect(botao.getAttribute('aria-expanded')).toBe('true')
    const auditoria = document.getElementById(botao.getAttribute('aria-controls')!)!
    expect(within(auditoria).getByText(/SELECT efeito, valor_brl/)).toBeTruthy()
    expect(within(auditoria).getByText('gold_receita_demo')).toBeTruthy()
    expect(within(auditoria).getByText('Dados retornados · 4 linhas')).toBeTruthy()
    const tabela = within(auditoria).getByRole('table')
    expect(within(tabela).getAllByRole('row')).toHaveLength(5)
    expect(within(tabela).getByRole('columnheader', { name: 'Valor brl' })).toBeTruthy()

    fireEvent.click(botao)
    expect(within(painel).queryByText(/SELECT efeito, valor_brl/)).toBeNull()
  })

  it('mostra os estados "não sei" e bloqueado', async () => {
    abrirPortal()
    const painel = abrirPainel()
    escrever(painel, 'Qual a previsão de lucro em 2030?')
    fireEvent.click(within(painel).getByRole('button', { name: 'Enviar' }))
    expect(
      await within(painel).findByText('Não sei responder com os dados disponíveis'),
    ).toBeTruthy()

    escrever(painel, 'DROP TABLE clientes')
    fireEvent.keyDown(within(painel).getByLabelText('Sua pergunta'), { key: 'Enter' })
    expect(await within(painel).findByText('Pedido bloqueado')).toBeTruthy()
    expect(within(painel).getByText(/somente leitura e não altera/)).toBeTruthy()
    expect(within(painel).getByText(/nenhum dado foi alterado/)).toBeTruthy()
  })

  it('cartões de teste demonstram "não sei" e o bloqueio, e a saudação usa o nome do usuário', async () => {
    abrirPortal()
    const painel = abrirPainel()
    expect(within(painel).getByText(/Olá, Patrícia\./)).toBeTruthy()

    fireEvent.click(within(painel).getByRole('button', { name: /Testar "Não sei"/ }))
    expect(within(painel).getByText(PERGUNTAS_DE_TESTE.naoSei)).toBeTruthy()
    expect(
      await within(painel).findByText('Não sei responder com os dados disponíveis'),
    ).toBeTruthy()

    fireEvent.click(within(painel).getByRole('button', { name: 'Limpar conversa' }))
    fireEvent.click(within(painel).getByRole('button', { name: /Testar segurança/ }))
    expect(within(painel).getByText(PERGUNTAS_DE_TESTE.seguranca)).toBeTruthy()
    expect(await within(painel).findByText('Pedido bloqueado')).toBeTruthy()
  })

  it('Shift+Enter quebra a linha em vez de enviar', () => {
    abrirPortal()
    const painel = abrirPainel()
    escrever(painel, 'Primeira linha')
    fireEvent.keyDown(within(painel).getByLabelText('Sua pergunta'), {
      key: 'Enter',
      shiftKey: true,
    })
    const conversa = within(painel).getByRole('log', { name: 'Conversa com o assistente' })
    expect(within(conversa).queryByText('Primeira linha')).toBeNull()
    expect((within(painel).getByLabelText('Sua pergunta') as HTMLTextAreaElement).value).toBe(
      'Primeira linha',
    )
    expect(within(painel).getByRole('list', { name: 'Perguntas sugeridas' })).toBeTruthy()
  })

  it('guarda a conversa ao fechar com Esc, ao trocar de tela e na tela /assistente', async () => {
    const router = abrirPortal()
    let painel = abrirPainel()
    fireEvent.click(within(painel).getByRole('button', { name: 'Qual foi a receita no período?' }))
    expect(await within(painel).findByRole('button', { name: 'Como cheguei nisso' })).toBeTruthy()

    fireEvent.keyDown(painel, { key: 'Escape' })
    expect(screen.queryByRole('complementary', { name: 'Assistente V-Energy' })).toBeNull()

    await act(() => router.navigate('/receita'))
    expect(screen.getByText('Conteúdo do diagnóstico da receita')).toBeTruthy()
    painel = abrirPainel()
    expect(within(painel).getByText('Qual foi a receita no período?')).toBeTruthy()

    await act(() => router.navigate('/assistente'))
    expect(screen.queryByRole('complementary', { name: 'Assistente V-Energy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pergunte à IA' })).toBeNull()
    const conversa = screen.getByRole('log', { name: 'Conversa com o assistente' })
    expect(within(conversa).getByText('Qual foi a receita no período?')).toBeTruthy()
  })

  it('limpar a conversa volta às sugestões', async () => {
    abrirPortal()
    const painel = abrirPainel()
    fireEvent.click(
      within(painel).getByRole('button', { name: 'Quais UCs têm maior risco de perda?' }),
    )
    await within(painel).findByText(/maior risco de perda são/)
    fireEvent.click(within(painel).getByRole('button', { name: 'Limpar conversa' }))
    expect(within(painel).getByRole('list', { name: 'Perguntas sugeridas' })).toBeTruthy()
    expect(within(painel).queryByText(/maior risco de perda são/)).toBeNull()
  })
})
