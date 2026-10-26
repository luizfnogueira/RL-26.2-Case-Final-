import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/erro-api'
import Button from './Button'
import ErrorState from './ErrorState'
import Input from './Input'
import Modal from './Modal'
import Paginacao from './Paginacao'
import { paginasVisiveis } from './paginas'
import SeloFicticio from './SeloFicticio'
import Select from './Select'
import Tabela, { type Coluna } from './Tabela'

afterEach(cleanup)

describe('Button', () => {
  it('não envia formulário por padrão e bloqueia cliques enquanto carrega', () => {
    const aoClicar = vi.fn()
    const { rerender } = render(<Button onClick={aoClicar}>Salvar</Button>)
    const botao = screen.getByRole('button', { name: 'Salvar' })
    expect(botao.getAttribute('type')).toBe('button')
    fireEvent.click(botao)
    expect(aoClicar).toHaveBeenCalledTimes(1)

    rerender(
      <Button carregando onClick={aoClicar}>
        Salvar
      </Button>,
    )
    const ocupado = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement
    expect(ocupado.disabled).toBe(true)
    expect(ocupado.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(ocupado)
    expect(aoClicar).toHaveBeenCalledTimes(1)
  })
})

describe('Input e Select', () => {
  it('liga rótulo, ajuda e erro ao controle para leitores de tela', () => {
    render(<Input rotulo="Justificativa" ajuda="Mínimo de 10 caracteres" />)
    const campo = screen.getByLabelText('Justificativa')
    expect(campo.getAttribute('aria-invalid')).toBeNull()
    expect(campo.getAttribute('aria-describedby')).toBe(
      screen.getByText('Mínimo de 10 caracteres').id,
    )

    cleanup()
    render(<Input rotulo="Justificativa" ajuda="dica" erro="Obrigatória." />)
    const invalido = screen.getByLabelText('Justificativa')
    expect(invalido.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toBe('Obrigatória.')
    expect(invalido.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
  })

  it('Select avisa o valor escolhido e mostra a opção vazia', () => {
    const aoMudar = vi.fn()
    render(
      <Select
        rotulo="Classe"
        valor=""
        aoMudar={aoMudar}
        vazio="Todas"
        opcoes={[
          { valor: 'Residencial', rotulo: 'Residencial' },
          { valor: 'Industrial', rotulo: 'Industrial', desabilitada: true },
        ]}
      />,
    )
    const lista = screen.getByLabelText('Classe') as HTMLSelectElement
    expect(
      within(lista)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Todas', 'Residencial', 'Industrial'])
    fireEvent.change(lista, { target: { value: 'Residencial' } })
    expect(aoMudar).toHaveBeenCalledWith('Residencial')
    expect((screen.getByRole('option', { name: 'Industrial' }) as HTMLOptionElement).disabled).toBe(
      true,
    )
  })
})

describe('Modal', () => {
  function Exemplo({ aoFechar = () => undefined }: { aoFechar?: () => void }) {
    return (
      <Modal
        aberto
        aoFechar={aoFechar}
        titulo="Cancelar ordem"
        descricao="Explique o motivo."
        rodape={<Button>Confirmar</Button>}
      >
        <Input rotulo="Justificativa" />
      </Modal>
    )
  }

  it('não renderiza nada fechado e expõe o diálogo nomeado quando aberto', () => {
    const { rerender } = render(
      <Modal aberto={false} aoFechar={() => undefined} titulo="Cancelar ordem" />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<Modal aberto aoFechar={() => undefined} titulo="Cancelar ordem" />)
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar ordem' })
    expect(dialogo.getAttribute('aria-modal')).toBe('true')
  })

  it('fecha com Esc, com o botão e com clique no fundo, mas não com clique dentro', () => {
    const aoFechar = vi.fn()
    render(<Exemplo aoFechar={aoFechar} />)
    const dialogo = screen.getByRole('dialog')

    fireEvent.mouseDown(dialogo)
    expect(aoFechar).not.toHaveBeenCalled()

    fireEvent.mouseDown(dialogo.parentElement as HTMLElement)
    expect(aoFechar).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(aoFechar).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalledTimes(3)
  })

  it('prende o foco, trava a rolagem e devolve o foco a quem abriu', () => {
    const abrir = document.createElement('button')
    document.body.append(abrir)
    abrir.focus()

    const { unmount } = render(<Exemplo />)
    const dialogo = screen.getByRole('dialog')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(dialogo)

    const fechar = screen.getByRole('button', { name: 'Fechar' })
    const confirmar = screen.getByRole('button', { name: 'Confirmar' })
    confirmar.focus()
    fireEvent.keyDown(confirmar, { key: 'Tab' })
    expect(document.activeElement).toBe(fechar)
    fireEvent.keyDown(fechar, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirmar)

    unmount()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(abrir)
    abrir.remove()
  })
})

interface Linha {
  id: number
  nome: string
  valor: number | null
}

const LINHAS: Linha[] = [
  { id: 1, nome: 'Olinda', valor: 20 },
  { id: 2, nome: 'Recife', valor: 90 },
  { id: 3, nome: 'Camaragibe', valor: null },
  { id: 4, nome: 'Paulista', valor: 5 },
]

const COLUNAS: Coluna<Linha>[] = [
  {
    id: 'nome',
    cabecalho: 'Município',
    celula: (l) => l.nome,
    ordenavel: true,
    valorOrdenacao: (l) => l.nome,
  },
  {
    id: 'valor',
    cabecalho: 'Valor',
    celula: (l) => String(l.valor ?? '—'),
    ordenavel: true,
    valorOrdenacao: (l) => l.valor,
  },
  { id: 'fixa', cabecalho: 'Fixa', celula: () => '·' },
]

const nomes = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((linha) => within(linha).getAllByRole('cell')[0].textContent)

describe('Tabela', () => {
  it('ordena localmente: crescente, decrescente e de volta à ordem original', () => {
    render(
      <Tabela legenda="Municípios" colunas={COLUNAS} linhas={LINHAS} chaveLinha={(l) => l.id} />,
    )
    const cabecalho = screen.getByRole('columnheader', { name: 'Município' })
    const botao = within(cabecalho).getByRole('button')
    expect(cabecalho.getAttribute('aria-sort')).toBe('none')
    expect(nomes()).toEqual(['Olinda', 'Recife', 'Camaragibe', 'Paulista'])

    fireEvent.click(botao)
    expect(cabecalho.getAttribute('aria-sort')).toBe('ascending')
    expect(nomes()).toEqual(['Camaragibe', 'Olinda', 'Paulista', 'Recife'])

    fireEvent.click(botao)
    expect(cabecalho.getAttribute('aria-sort')).toBe('descending')
    expect(nomes()).toEqual(['Recife', 'Paulista', 'Olinda', 'Camaragibe'])

    fireEvent.click(botao)
    expect(cabecalho.getAttribute('aria-sort')).toBe('none')
    expect(nomes()).toEqual(['Olinda', 'Recife', 'Camaragibe', 'Paulista'])
  })

  it('deixa valores ausentes no fim, em qualquer direção', () => {
    render(
      <Tabela legenda="Municípios" colunas={COLUNAS} linhas={LINHAS} chaveLinha={(l) => l.id} />,
    )
    const botao = within(screen.getByRole('columnheader', { name: 'Valor' })).getByRole('button')
    fireEvent.click(botao)
    expect(nomes()).toEqual(['Paulista', 'Olinda', 'Recife', 'Camaragibe'])
    fireEvent.click(botao)
    expect(nomes()).toEqual(['Recife', 'Olinda', 'Paulista', 'Camaragibe'])
  })

  it('no modo do servidor só avisa o clique e não reordena as linhas', () => {
    const aoOrdenar = vi.fn()
    render(
      <Tabela
        legenda="Municípios"
        colunas={COLUNAS}
        linhas={LINHAS}
        chaveLinha={(l) => l.id}
        ordenacao={null}
        aoOrdenar={aoOrdenar}
      />,
    )
    fireEvent.click(
      within(screen.getByRole('columnheader', { name: 'Município' })).getByRole('button'),
    )
    expect(aoOrdenar).toHaveBeenCalledWith({ coluna: 'nome', direcao: 'asc' })
    expect(nomes()).toEqual(['Olinda', 'Recife', 'Camaragibe', 'Paulista'])
  })

  it('mostra esqueleto carregando, estado vazio e a paginação do servidor', () => {
    const aoMudar = vi.fn()
    const { rerender } = render(
      <Tabela legenda="x" colunas={COLUNAS} linhas={[]} chaveLinha={(l) => l.id} carregando />,
    )
    expect(screen.getByRole('table').getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText('Nada por aqui')).toBeNull()

    rerender(<Tabela legenda="x" colunas={COLUNAS} linhas={[]} chaveLinha={(l) => l.id} />)
    expect(screen.getByText('Nada por aqui')).toBeTruthy()

    rerender(
      <Tabela
        legenda="x"
        colunas={COLUNAS}
        linhas={LINHAS}
        chaveLinha={(l) => l.id}
        paginacao={{ page: 2, pageSize: 4, total: 10, aoMudar }}
      />,
    )
    expect(screen.getByText('5–8 de 10')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(aoMudar).toHaveBeenCalledWith(3)
  })

  it('linha clicável também responde ao teclado', () => {
    const aoClicarLinha = vi.fn()
    render(
      <Tabela
        legenda="x"
        colunas={COLUNAS}
        linhas={LINHAS}
        chaveLinha={(l) => l.id}
        aoClicarLinha={aoClicarLinha}
      />,
    )
    const linha = screen.getAllByRole('row')[2]
    fireEvent.keyDown(linha, { key: 'Enter' })
    expect(aoClicarLinha).toHaveBeenCalledWith(LINHAS[1])
  })
})

describe('Paginacao', () => {
  it('calcula a faixa exibida e desabilita os extremos', () => {
    const aoMudar = vi.fn()
    render(<Paginacao page={1} pageSize={20} total={134} aoMudar={aoMudar} />)
    expect(screen.getByText('1–20 de 134')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByRole('button', { name: 'Página 1' }).getAttribute('aria-current')).toBe(
      'page',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Página 7' }))
    expect(aoMudar).toHaveBeenCalledWith(7)
  })

  it('compacta as páginas com reticências', () => {
    expect(paginasVisiveis(1, 3)).toEqual([1, 2, 3])
    expect(paginasVisiveis(1, 10)).toEqual([1, 2, null, 10])
    expect(paginasVisiveis(5, 10)).toEqual([1, null, 4, 5, 6, null, 10])
    expect(paginasVisiveis(10, 10)).toEqual([1, null, 9, 10])
  })
})

describe('ErrorState e SeloFicticio', () => {
  it('mostra a mensagem da API e permite tentar de novo', () => {
    const aoTentarNovamente = vi.fn()
    render(
      <ErrorState
        erro={new ApiError(422, 'CENARIO_STUB_INDISPONIVEL', 'Período fora do cenário.')}
        aoTentarNovamente={aoTentarNovamente}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Período fora do cenário.')
    expect(screen.getByText('CENARIO_STUB_INDISPONIVEL · HTTP 422')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarNovamente).toHaveBeenCalled()
  })

  it('usa texto amigável quando a rede cai (status 0) ou o erro não é da API', () => {
    render(<ErrorState erro={new ApiError(0, 'REDE_INDISPONIVEL', 'Failed to fetch')} />)
    expect(screen.getByRole('alert').textContent).not.toContain('Failed to fetch')
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar')
  })

  it('o selo só aparece para dados fictícios', () => {
    const { rerender } = render(<SeloFicticio metadados={{ dados_ficticios: true }} />)
    expect(screen.getByText('Dado fictício')).toBeTruthy()
    rerender(<SeloFicticio metadados={{ dados_ficticios: false }} />)
    expect(screen.queryByText('Dado fictício')).toBeNull()
    rerender(<SeloFicticio />)
    expect(screen.queryByText('Dado fictício')).toBeNull()
  })
})
