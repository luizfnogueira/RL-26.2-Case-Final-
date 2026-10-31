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
import type { ResultadoConsulta } from '@/hooks/useConsulta'
import ReceitaPage from '@/pages/ReceitaPage'
import { buscarDashboard, gerarInsight } from '@/services'
import { PREFIXO_TEXTO_ALTERNATIVO, type RespostaInsight } from '@/types/ia'
import AnaliseIA from './AnaliseIA'
import DrillDownReceita from './DrillDownReceita'
import PonteDaReceita from './PonteDaReceita'
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

describe('sem decomposição na Gold (fora de P1 × P2 ou com alimentador)', () => {
  const consultaDe = (dados: RespostaInsight | null): ResultadoConsulta<RespostaInsight> => ({
    dados,
    erro: null,
    carregando: false,
    recarregar: () => undefined,
  })

  it('o mock imita a API: ponte null, drill-down vazio e o motivo na última observação', async () => {
    const d = await buscarDashboard({
      periodo_atual: ATUAL,
      periodo_comparacao: COMPARACAO,
      alimentador: 'ALM-DEMO-001',
    })
    expect(Object.values(d.ponte_receita).every((i) => i.valor === null)).toBe(true)
    expect(d.drill_down.items).toEqual([])
    expect(d.drill_down.total).toBe(0)
    expect(d.metadados.observacoes.at(-1)).toMatch(/não existem por alimentador/)
    // KPIs e série seguem normais
    expect(d.indicadores.receita_faturada.atual.valor).not.toBeNull()
    expect(d.serie_historica).toHaveLength(48)
    expect(etapasDaPonte(d)).toBeNull()
    expect(explicarResultado(d)).toEqual([])
    expect(numerosDoInsight(d)).toBeNull()
  })

  it('o insight da receita responde 422 DECOMPOSICAO_INDISPONIVEL nesse recorte', async () => {
    await expect(
      gerarInsight({
        contexto: 'receita',
        filtros: {
          periodo_atual: ATUAL,
          periodo_comparacao: COMPARACAO,
          alimentador: 'ALM-DEMO-001',
        },
      }),
    ).rejects.toMatchObject({ status: 422, codigo: 'DECOMPOSICAO_INDISPONIVEL' })
  })

  it('mostra o motivo no gráfico e no drill-down vazio em vez de números inventados', async () => {
    const d = await buscarDashboard({
      periodo_atual: ATUAL,
      periodo_comparacao: COMPARACAO,
      alimentador: 'ALM-DEMO-001',
    })
    const motivo = d.metadados.observacoes.at(-1) ?? ''
    render(
      <MemoryRouter>
        <PonteDaReceita dashboard={d} />
        <DrillDownReceita
          drill={d.drill_down}
          aoSelecionar={() => undefined}
          aoNavegar={() => undefined}
          aoMudarPagina={() => undefined}
          motivoVazio={motivo}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Decomposição indisponível para este recorte')).toBeTruthy()
    expect(screen.getAllByText(motivo)).toHaveLength(2)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('texto alternativo da API não é rotulado como gerado por IA', () => {
    const base = {
      titulo: 'Resumo',
      texto: 'A receita passou de R$ 150 milhões para R$ 162 milhões.',
      numeros_utilizados: [],
      gerado_em: new Date().toISOString(),
    }
    const comIA = {
      ...base,
      metadados: {
        dados_ficticios: false,
        gold_atualizada_em: null,
        observacoes: ['Dados do seed.'],
      },
    }
    const alternativo = {
      ...base,
      metadados: {
        dados_ficticios: false,
        gold_atualizada_em: null,
        observacoes: [
          'Dados do seed.',
          `${PREFIXO_TEXTO_ALTERNATIVO} o módulo de IA não respondeu; resumo montado por regra.`,
        ],
      },
    }
    const { rerender } = render(<AnaliseIA consulta={consultaDe(comIA)} />)
    expect(screen.getByText('Gerado por IA')).toBeTruthy()
    expect(screen.queryByText('Texto alternativo')).toBeNull()
    rerender(<AnaliseIA consulta={consultaDe(alternativo)} />)
    expect(screen.queryByText('Gerado por IA')).toBeNull()
    expect(screen.getByText('Texto alternativo')).toBeTruthy()
    expect(screen.getByText('o módulo de IA não respondeu; resumo montado por regra.')).toBeTruthy()
  })
})

describe('nomes em maiúsculas vindos do banco', () => {
  const indicador = (valor: number, unidade: string) => ({
    valor,
    unidade,
    periodo_referencia: ATUAL,
  })

  it('a tabela e o breadcrumb mostram "Boa Vista", mas a URL leva o valor do banco', () => {
    const linha = {
      nivel: 'bairro' as const,
      nome: 'BOA VISTA',
      receita_energia_atual: indicador(10, 'BRL'),
      receita_energia_comparacao: indicador(9, 'BRL'),
      energia_atual: indicador(90, 'kWh'),
      energia_comparacao: indicador(100, 'kWh'),
      variacao_energia_percentual: indicador(-10, '%'),
      queda_kwh: indicador(10, 'kWh'),
      efeito_preco: indicador(2, 'BRL'),
      efeito_volume: indicador(-1, 'BRL'),
      filtros: { municipio: 'RECIFE', bairro: 'BOA VISTA', classe: null },
    }
    const vazio = { municipio: null, bairro: null, classe: null }
    const selecionadas: unknown[] = []
    render(
      <MemoryRouter>
        <DrillDownReceita
          drill={{
            nivel: 'bairro',
            page: 1,
            page_size: 10,
            total: 1,
            items: [linha],
            breadcrumb: [
              { nivel: 'consolidado', rotulo: 'Todos os municípios', filtros: vazio },
              { nivel: 'municipio', rotulo: 'RECIFE', filtros: { ...vazio, municipio: 'RECIFE' } },
            ],
          }}
          aoSelecionar={(l) => selecionadas.push(l.filtros)}
          aoNavegar={() => undefined}
          aoMudarPagina={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('cell', { name: 'Boa Vista' })).toBeTruthy()
    expect(screen.getByText('Recife')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Comparar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('cell', { name: 'Boa Vista' }))
    expect(selecionadas).toEqual([{ municipio: 'RECIFE', bairro: 'BOA VISTA', classe: null }])
  })

  it('botão "Comparar" no drill-down leva os itens visíveis para a aba de comparação', () => {
    function Rastreador() {
      const loc = useLocation()
      return <output aria-label="Endereço">{loc.pathname + loc.search}</output>
    }

    const linha1 = {
      nivel: 'bairro' as const,
      nome: 'BOA VISTA',
      receita_energia_atual: indicador(10, 'BRL'),
      receita_energia_comparacao: indicador(9, 'BRL'),
      energia_atual: indicador(90, 'kWh'),
      energia_comparacao: indicador(100, 'kWh'),
      variacao_energia_percentual: indicador(-10, '%'),
      queda_kwh: indicador(10, 'kWh'),
      efeito_preco: indicador(2, 'BRL'),
      efeito_volume: indicador(-1, 'BRL'),
      filtros: { municipio: 'RECIFE', bairro: 'BOA VISTA', classe: null },
    }
    const linha2 = {
      ...linha1,
      nome: 'BOA VIAGEM',
      filtros: { municipio: 'RECIFE', bairro: 'BOA VIAGEM', classe: null },
    }
    const vazio = { municipio: null, bairro: null, classe: null }

    render(
      <MemoryRouter initialEntries={['/receita']}>
        <DrillDownReceita
          drill={{
            nivel: 'bairro',
            page: 1,
            page_size: 10,
            total: 2,
            items: [linha1, linha2],
            breadcrumb: [
              { nivel: 'consolidado', rotulo: 'Todos os municípios', filtros: vazio },
              { nivel: 'municipio', rotulo: 'RECIFE', filtros: { ...vazio, municipio: 'RECIFE' } },
            ],
          }}
          periodoAtual="2025-07/2026-06"
          periodoComparacao="2022-07/2023-06"
          aoSelecionar={() => undefined}
          aoNavegar={() => undefined}
          aoMudarPagina={() => undefined}
        />
        <Rastreador />
      </MemoryRouter>,
    )

    const botao = screen.getByRole('button', { name: 'Comparar' }) as HTMLButtonElement
    expect(botao.disabled).toBe(false)
    fireEvent.click(botao)
    const endereco = screen.getByLabelText('Endereço').textContent ?? ''
    expect(endereco).toContain('/painel?aba=comparar')
    expect(endereco).toContain('nivel=bairro')
    expect(endereco).toContain('municipio=RECIFE')
    expect(endereco).toContain('itens=BOA+VISTA')
    expect(endereco).toContain('itens=BOA+VIAGEM')
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

  it('"Ver por: Classes" lista as classes sem escolher bairro; clicar numa classe filtra por ela', async () => {
    const { busca } = abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Classes' }))
    expect(await screen.findByRole('columnheader', { name: 'Classe' })).toBeTruthy()
    expect(busca()).toBe('?ver=classe')
    expect(screen.getByRole('button', { name: 'Classes' }).getAttribute('aria-pressed')).toBe(
      'true',
    )

    const primeira = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[0]
    fireEvent.click(primeira)
    expect(await screen.findByRole('columnheader', { name: 'Município' })).toBeTruthy()
    expect(busca()).toMatch(/^\?classe=[^&]+$/)
  })

  it('destaca em barras as maiores perdas de receita por volume', async () => {
    abrir()
    const titulo = await screen.findByRole('heading', {
      name: 'Maiores perdas de receita por volume',
    })
    const barras = within(titulo.closest('section') as HTMLElement).getAllByRole('listitem')
    expect(barras.length).toBeGreaterThan(0)
    expect(barras.length).toBeLessThanOrEqual(5)
    expect(screen.getByText('Ordenado pela perda de receita por volume')).toBeTruthy()
  })

  it('com classe ativa, "Comparar" fica desabilitado e explica que a comparação não aplica a classe', async () => {
    abrir('/receita?classe=Residencial')
    expect(await screen.findByRole('columnheader', { name: 'Município' })).toBeTruthy()
    const comparar = screen.getByRole('button', { name: 'Comparar' }) as HTMLButtonElement
    expect(comparar.disabled).toBe(true)
    expect(comparar.title).toMatch(/não aplica o filtro de classe/)
  })

  it('escolher um bairro tira o "ver" da URL: voltar pelo breadcrumb mostra os bairros', async () => {
    const { busca } = abrir('/receita?municipio=Recife&bairro=Boa+Viagem&ver=classe')
    expect(await screen.findByRole('columnheader', { name: 'Classe' })).toBeTruthy()
    await waitFor(() => expect(busca()).not.toContain('ver='))
    const caminho = screen.getByRole('navigation', { name: 'Caminho do drill-down' })
    fireEvent.click(within(caminho).getByRole('button', { name: 'Recife' }))
    expect(await screen.findByRole('columnheader', { name: 'Bairro' })).toBeTruthy()
  })

  it('sem perda por volume no recorte, o bloco das maiores perdas diz isso', async () => {
    const dados = await consolidado()
    const semPerda = dados.drill_down.items.map((l) => ({
      ...l,
      efeito_volume: { ...l.efeito_volume, valor: Math.abs(l.efeito_volume.valor ?? 0) },
    }))
    render(
      <MemoryRouter>
        <DrillDownReceita
          drill={{ ...dados.drill_down, items: semPerda }}
          aoSelecionar={() => undefined}
          aoNavegar={() => undefined}
          aoMudarPagina={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Nenhuma perda por volume neste recorte.')).toBeTruthy()
  })

  it('com bairro escolhido, o seletor "Ver por" some: já é o ranking de classes do bairro', async () => {
    abrir('/receita?municipio=OLINDA&bairro=RIO+DOCE')
    expect(await screen.findByRole('columnheader', { name: 'Classe' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Ver por' })).toBeNull()
  })

  it('abre já filtrada quando a URL traz município e bairro (recarregar mantém)', async () => {
    // O filtro usa o valor da Gold (maiúsculas); o texto do insight vem formatado, como na API.
    abrir('/receita?municipio=OLINDA&bairro=RIO+DOCE')
    expect(await screen.findByRole('columnheader', { name: 'Classe' })).toBeTruthy()
    expect((screen.getByLabelText('Município') as HTMLSelectElement).value).toBe('OLINDA')
    expect((screen.getByLabelText('Bairro') as HTMLSelectElement).value).toBe('RIO DOCE')
    expect(await screen.findByText(/Em Olinda \/ Rio Doce/)).toBeTruthy()
  })

  it('período fora do cenário vira estado de erro com a mensagem da API e nova tentativa', async () => {
    abrir('/receita?periodo_atual=2024-07/2025-06')
    const alerta = await screen.findByRole('alert')
    await waitFor(() => expect(alerta.textContent).toContain('CENARIO_STUB_INDISPONIVEL'))
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})
