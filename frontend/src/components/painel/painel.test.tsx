import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import fixture from '@/data/mocks/dashboard.json'
import type { Dashboard, PontoSerie } from '@/types/dashboard'
import { formatarPeriodo } from '@/utils/periodos'
import HistoricoExecutivo from './HistoricoExecutivo'
import IndicadoresExecutivos from './IndicadoresExecutivos'
import { caminhoMensal, escalaMensal } from './historico'
import { leituraDoPeriodo } from './indicadores'

afterEach(cleanup)
const exemplo = () => structuredClone(fixture) as Dashboard

describe('apresentação dos indicadores', () => {
  it('trata redução de continuidade como favorável e aumento do valor em aberto como desfavorável', () => {
    render(<IndicadoresExecutivos indicadores={exemplo().indicadores} />)
    const dec = within(screen.getByRole('region', { name: 'DEC médio' })).getByTitle(
      'Variação percentual em relação ao período de comparação',
    )
    const aberto = within(screen.getByRole('region', { name: 'Valor em aberto' })).getByTitle(
      'Variação percentual em relação ao período de comparação',
    )
    expect(dec.className).toContain('bg-sucesso-suave')
    expect(dec.textContent).toContain('−13,6%')
    expect(aberto.className).toContain('bg-perigo-suave')
    expect(aberto.textContent).toContain('+27,9%')
  })

  it('a leitura não afirma crescimento quando a variação é zero ou ausente', () => {
    const { indicadores } = exemplo()
    indicadores.receita_faturada.variacao_percentual.valor = 0
    expect(leituraDoPeriodo(indicadores)).toContain('receita faturada ficou estável')
    indicadores.energia_faturada.variacao_percentual.valor = null
    expect(leituraDoPeriodo(indicadores)).toBe(
      'Consulte a evolução mensal e o diagnóstico para explorar este recorte.',
    )
  })
})

describe('origem da comparação (modal)', () => {
  const abrir = (rotulo: string) => {
    render(<IndicadoresExecutivos indicadores={exemplo().indicadores} />)
    const botao = screen.getByRole('button', { name: `Origem da comparação: ${rotulo}` })
    fireEvent.click(botao)
    return botao
  }
  const janela = () => screen.getByRole('dialog')
  const setaAnterior = () => screen.queryByRole('button', { name: /^KPI anterior:/ })
  const setaProxima = () => screen.queryByRole('button', { name: /^Próximo KPI:/ })
  // Os seis detalhamentos ficam no DOM; só o do KPI ativo fica acessível
  const paineis = () => [...janela().querySelectorAll<HTMLElement>('[data-detalhe-kpi]')]
  const painelAtivo = () => {
    const ativos = paineis().filter((painel) => !painel.hasAttribute('aria-hidden'))
    expect(ativos).toHaveLength(1)
    return ativos[0]
  }

  it('abre o dialog com o título do KPI e o detalhamento, sem nada expandir no card', () => {
    const botao = abrir('Valor em aberto')
    expect(botao.getAttribute('aria-haspopup')).toBe('dialog')
    const dialog = screen.getByRole('dialog', { name: 'Valor em aberto' })
    expect(dialog.textContent).toContain('Indicador 4 de 6')
    const texto = painelAtivo().textContent ?? ''
    expect(texto).toContain(formatarPeriodo('2025-07/2026-06'))
    expect(texto).toContain(formatarPeriodo('2022-07/2023-06'))
    expect(texto).toContain('R$ 12.811.500,00')
    expect(texto).toContain('R$ 10.016.800,00')
    expect(texto).toContain('= +27,9%')
    expect(texto).toContain('Valores e variação vêm da API; o portal não recalcula os números.')
    // Linhas extras do KpiInadimplencia
    expect(texto).toContain('% da receita no período atual4,5%')
    expect(texto).toContain('% da receita no período comparado3,8%')
    expect(texto).toContain('+0,7 p.p.')
    // O detalhamento só existe no modal
    const card = screen.getByRole('region', { name: 'Valor em aberto' })
    expect(within(card).queryByText('Período comparado')).toBeNull()
  })

  it('valores monetários não quebram entre "R$" e o número', () => {
    abrir('Valor em aberto')
    const valor = within(painelAtivo()).getByText('R$ 12.811.500,00', { selector: 'dd' })
    expect(valor.className).toContain('whitespace-nowrap')
    expect(valor.className).toContain('tabular-nums')
  })

  it('renderiza os seis detalhamentos empilhados e só o ativo fica visível e acessível', () => {
    abrir('UCs ativas')
    expect(paineis().map((painel) => painel.dataset.detalheKpi)).toEqual([
      'receita_faturada',
      'energia_faturada',
      'ucs_ativas',
      'inadimplencia',
      'dec_medio',
      'fec_medio',
    ])
    expect(painelAtivo().dataset.detalheKpi).toBe('ucs_ativas')
    for (const painel of paineis()) {
      // Todos na mesma célula do grid: a altura é a do maior
      expect(painel.className).toContain('col-start-1 row-start-1 self-start')
      if (painel === painelAtivo()) {
        expect(painel.hasAttribute('inert')).toBe(false)
        expect(painel.className).toContain('opacity-100')
      } else {
        expect(painel.getAttribute('aria-hidden')).toBe('true')
        expect(painel.hasAttribute('inert')).toBe(true)
        expect(painel.className).toContain('invisible')
        expect(painel.className).toContain('pointer-events-none')
      }
    }
    // A árvore de acessibilidade só alcança o detalhamento ativo (os outros têm aria-hidden)
    const valores = within(janela()).getAllByRole('definition')
    expect(valores.every((dd) => painelAtivo().contains(dd))).toBe(true)
    expect(valores.map((dd) => dd.textContent)).toContain('412.350')
  })

  it('os seguintes esperam à direita e os anteriores à esquerda (sentido da navegação)', () => {
    abrir('UCs ativas')
    const deslocamento = () =>
      paineis().map((painel) =>
        painel.className.includes('-translate-x-2')
          ? 'esquerda'
          : painel.className.includes('translate-x-2')
            ? 'direita'
            : 'centro',
      )
    expect(deslocamento()).toEqual([
      'esquerda',
      'esquerda',
      'centro',
      'direita',
      'direita',
      'direita',
    ])
    fireEvent.click(setaProxima()!)
    expect(deslocamento()).toEqual([
      'esquerda',
      'esquerda',
      'esquerda',
      'centro',
      'direita',
      'direita',
    ])
    for (const painel of paineis()) {
      expect(painel.className).toContain('motion-safe:transition-[opacity,translate,visibility]')
      expect(painel.className).toContain('motion-safe:duration-200')
    }
  })

  it('navegar rápido termina com um único conteúdo ativo', () => {
    abrir('Receita faturada (com tributos)')
    for (let i = 0; i < 10; i++) fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.click(setaAnterior()!)
    fireEvent.click(setaAnterior()!)
    for (let i = 0; i < 3; i++) fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(painelAtivo().dataset.detalheKpi).toBe('fec_medio')
    expect(screen.getByRole('dialog', { name: 'FEC médio' })).toBeTruthy()
  })

  it('o modal do painel usa as animações de entrada', () => {
    abrir('UCs ativas')
    expect(janela().className).toContain('motion-safe:animate-modal-entrada')
    expect(janela().parentElement?.className).toContain('motion-safe:animate-fundo-entrada')
  })

  it.each([
    ['Receita faturada (com tributos)', null, 'Volume faturado'],
    ['UCs ativas', 'Volume faturado', 'Valor em aberto'],
    ['FEC médio', 'DEC médio', null],
  ])('%s: só as setas que têm KPI naquela direção', (rotulo, anterior, proximo) => {
    abrir(rotulo)
    expect(setaAnterior()?.getAttribute('aria-label') ?? null).toBe(
      anterior && `KPI anterior: ${anterior}`,
    )
    expect(setaProxima()?.getAttribute('aria-label') ?? null).toBe(
      proximo && `Próximo KPI: ${proximo}`,
    )
  })

  it('as setas trocam o título e a posição sem fechar nem reabrir o modal', () => {
    abrir('UCs ativas')
    const dialog = janela()
    expect(dialog.textContent).toContain('Indicador 3 de 6')
    fireEvent.click(setaProxima()!)
    expect(screen.getByRole('dialog', { name: 'Valor em aberto' })).toBe(dialog)
    expect(dialog.textContent).toContain('Indicador 4 de 6')
    fireEvent.click(setaAnterior()!)
    fireEvent.click(setaAnterior()!)
    expect(screen.getByRole('dialog', { name: 'Volume faturado' })).toBe(dialog)
    expect(dialog.textContent).toContain('Indicador 2 de 6')
  })

  it('← e → navegam e param nas pontas, sem volta circular', () => {
    abrir('Receita faturada (com tributos)')
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(screen.getByRole('dialog', { name: 'Receita faturada (com tributos)' })).toBeTruthy()
    for (let i = 0; i < 7; i++) fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: 'FEC médio' }).textContent).toContain(
      'Indicador 6 de 6',
    )
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(screen.getByRole('dialog', { name: 'DEC médio' })).toBeTruthy()
  })

  it('a seta focada que some na ponta passa o foco para a outra', () => {
    abrir('DEC médio')
    const proxima = setaProxima()!
    proxima.focus()
    fireEvent.click(proxima)
    expect(setaProxima()).toBeNull()
    expect(document.activeElement).toBe(setaAnterior())
  })

  it('Esc fecha e devolve o foco ao botão do card', () => {
    const botao = abrir('UCs ativas')
    fireEvent.keyDown(janela(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(botao)
  })

  it('o X fecha e o foco vai ao card ativo no fechamento, não ao que abriu', () => {
    abrir('UCs ativas')
    fireEvent.click(setaProxima()!)
    fireEvent.click(within(janela()).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Origem da comparação: Valor em aberto' }),
    )
  })

  it('fechado, ← e → não fazem nada', () => {
    abrir('UCs ativas')
    fireEvent.keyDown(janela(), { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('histórico executivo', () => {
  it('cada unidade tem uma escala independente e a base positiva começa em zero', () => {
    const reais = escalaMensal([0, 1000])
    const kwh = escalaMensal([0, 100])
    expect(reais.marcas[0]).toBe(0)
    expect(kwh.marcas[0]).toBe(0)
    expect(reais.y(1000)).toBeCloseTo(kwh.y(100))
    expect(reais.marcas.at(-1)).not.toBe(kwh.marcas.at(-1))
    expect(Number.isFinite(escalaMensal([0, null]).y(0))).toBe(true)
  })

  it('interrompe a linha em uma ausência, preservando o zero como ponto', () => {
    const pontos = exemplo().serie_historica.slice(0, 3)
    pontos[0].receita.valor = 0
    pontos[1].receita.valor = null
    const caminho = caminhoMensal(pontos, 'receita', escalaMensal([0, 100]).y)
    expect(caminho.match(/M/g)).toHaveLength(2)
    expect(caminho).not.toContain('L')
    expect(caminho).toContain('M88.00,246.00')
  })

  it('exibe ausência na tabela sem substituir por zero', () => {
    const pontos: PontoSerie[] = exemplo().serie_historica.slice(0, 1)
    pontos[0].receita.valor = null
    render(<HistoricoExecutivo pontos={pontos} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    expect(within(screen.getByRole('table')).getByRole('cell', { name: '—' })).toBeTruthy()
  })

  it('exibe vazio quando nenhuma série possui valores', () => {
    render(<HistoricoExecutivo pontos={[]} />)
    expect(screen.getByText('Histórico indisponível')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
