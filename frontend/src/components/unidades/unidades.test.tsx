import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import unidadeFixture from '@/data/mocks/unidade.json'
import UnidadePage from '@/pages/UnidadePage'
import type { ConsumoMes, DiagnosticoConta, Fatura, Medidor, Unidade360 } from '@/types/unidades'
import BlocoDiagnostico from './BlocoDiagnostico'
import { BlocoMedidor } from './BlocosCadastrais'
import { BlocoFaturas } from './BlocosHistorico'
import { caminhoBarra } from '@/components/graficos/geometria'
import { mesesEstimados, pontosDoConsumo } from './consumo'
import { estiloBandeira, rotuloModalidadeGd } from './rotulos'

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
    expect(d.getByText(/^Leitura estimada em jun\/2026/)).toBeTruthy() // minúsculas no alerta
    expect(d.getByText('Saiba mais')).toBeTruthy()
    expect(d.getByText('Explicação geral')).toBeTruthy()
    expect(d.getByText(/a diferença entre o estimado e o real costuma ser acertada/)).toBeTruthy()
    expect(d.getByText('Meses com leitura estimada no período')).toBeTruthy()
    expect(d.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Jun/2026: ainda sem leitura posterior no período',
    ])
  })

  it('estimada só no ano anterior: sem selo, mas com alerta e "Saiba mais"', () => {
    const unidade = unidadeFixture as Unidade360
    const soAnoAnterior: DiagnosticoConta = {
      ...unidade.diagnostico_conta,
      leitura_estimada: true, // o mesmo mês do ano anterior foi estimado
      alerta: 'Leitura estimada em jun/2025: a comparação com o ano anterior é fraca.',
    }
    const consumoReal = unidade.consumo.map((m) => ({ ...m, tipo_leitura: 'REAL' as const }))
    render(<BlocoDiagnostico diagnostico={soAnoAnterior} consumo={consumoReal} />)
    expect(screen.queryByText('Leitura estimada')).toBeNull() // selo é só do mês analisado
    expect(screen.getByText(/^Leitura estimada em jun\/2025/)).toBeTruthy()
    expect(screen.getByText('Saiba mais')).toBeTruthy()
    expect(screen.getByText(/^Nenhum mês do período foi estimado/)).toBeTruthy()
  })

  it('mesesEstimados: a situação da leitura seguinte, do mais recente para o mais antigo', () => {
    const tipos: Record<string, ConsumoMes['tipo_leitura']> = {
      '2025-07': 'ESTIMADA', // seguinte REAL
      '2025-08': 'REAL',
      '2025-09': 'ESTIMADA', // seguinte AUTENTICADA (real)
      '2025-10': 'AUTENTICADA',
      '2025-11': 'ESTIMADA', // seguinte ESTIMADA
      '2025-12': 'ESTIMADA', // seguinte MEDIA (não é real)
      '2026-01': 'MEDIA',
      '2026-02': 'ESTIMADA', // seguinte sem dado
      '2026-03': null,
      '2026-04': 'REAL',
      '2026-05': 'REAL',
      '2026-06': 'ESTIMADA', // último do período
    }
    const consumo = (unidadeFixture as Unidade360).consumo.map((m) => ({
      ...m,
      tipo_leitura: tipos[m.mes],
    }))
    expect(mesesEstimados(consumo)).toEqual([
      { mes: '2026-06', seguinte: 'ainda sem leitura posterior no período' },
      { mes: '2026-02', seguinte: 'sem dado no mês seguinte (Mar/2026)' },
      { mes: '2025-12', seguinte: 'a leitura seguinte (Jan/2026) não foi real (Media)' },
      { mes: '2025-11', seguinte: 'a leitura seguinte (Dez/2025) também foi estimada' },
      { mes: '2025-09', seguinte: 'a leitura seguinte (Out/2025) foi real' },
      { mes: '2025-07', seguinte: 'a leitura seguinte (Ago/2025) foi real' },
    ])
  })

  it('alerta só de troca de medidor não traz o "Saiba mais" de leitura estimada', () => {
    const unidade = unidadeFixture as Unidade360
    const soTroca: DiagnosticoConta = {
      ...unidade.diagnostico_conta,
      leitura_estimada: false,
      alerta:
        'Troca de medidor em jun/2026: a primeira leitura após a troca pode distorcer a comparação.',
    }
    render(<BlocoDiagnostico diagnostico={soTroca} consumo={[]} />)
    expect(screen.getByText(/^Troca de medidor/)).toBeTruthy()
    expect(screen.queryByText('Saiba mais')).toBeNull()
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
    render(<BlocoDiagnostico diagnostico={vazio} consumo={[]} />)
    expect(screen.getByRole('heading', { name: 'Sem consumo nesta janela' })).toBeTruthy()
    expect(screen.queryByText('Último mês')).toBeNull()
  })
})

describe('medidor: selo só para leitura estimada', () => {
  it('leitura real não leva selo', () => {
    const medidor = unidadeFixture.medidor as Medidor
    render(
      <BlocoMedidor
        medidor={{
          ...medidor,
          ultima_leitura: { ...medidor.ultima_leitura!, tipo_leitura: 'REAL' },
        }}
      />,
    )
    expect(screen.getByText('18.452 kWh em 28/06/2026')).toBeTruthy()
    expect(screen.queryByText('Real')).toBeNull()
    expect(screen.queryByText('Estimada')).toBeNull()
  })
})

describe('consumo, faturas, interrupções e chamados', () => {
  const regiao = (nome: string) => within(screen.getByRole('region', { name: nome }))
  const linhas = (nome: string) => regiao(nome).getAllByRole('row').slice(1)

  it('UC completa: 12 meses, faturas, interrupções com hora de Recife e chamados com nota', async () => {
    abrir('/unidades/UC-DEMO-001')
    await screen.findByRole('heading', { name: 'Titular de exemplo 001' })

    fireEvent.click(
      regiao('Consumo dos últimos 12 meses').getByRole('button', { name: 'Ver como tabela' }),
    )
    const consumo = linhas('Consumo dos últimos 12 meses')
    expect(consumo).toHaveLength(12)
    expect(within(consumo[0]).getByText('Jul/2025')).toBeTruthy()
    expect(within(consumo[0]).getByText('305 kWh')).toBeTruthy()
    expect(within(consumo[0]).getByText('312 kWh')).toBeTruthy()
    expect(within(consumo[0]).getByText('Real')).toBeTruthy()
    expect(within(consumo[11]).getByText('Estimada')).toBeTruthy()

    const faturas = regiao('Faturas')
    expect(faturas.getByText('R$ 486,00')).toBeTruthy() // em aberto
    expect(faturas.getByText('12/07/2026')).toBeTruthy() // vencimento
    expect(faturas.getByText('R$ 355,00')).toBeTruthy() // paga
    expect(faturas.getByText('10/06/2026')).toBeTruthy() // pago em
    expect(faturas.queryByText('Antes do período')).toBeNull()

    const interrupcoes = regiao('Interrupções de energia')
    expect(interrupcoes.getByText('2 mais recentes de 2 no período')).toBeTruthy()
    expect(interrupcoes.getByText('14/06/2026, 19:20')).toBeTruthy()
    expect(interrupcoes.getByText('1 h 45 min')).toBeTruthy()

    const chamados = regiao('Chamados')
    expect(chamados.getByText('02/07/2026, 10:05')).toBeTruthy()
    expect(chamados.getByText('30,4 h')).toBeTruthy()
    expect(chamados.getByText('3,0')).toBeTruthy()
  })

  it('UC recente: meses sem dado, nenhuma interrupção e chamado sem nota', async () => {
    abrir('/unidades/UC-DEMO-007')
    await screen.findByRole('heading', { name: 'Titular de exemplo 007' })

    fireEvent.click(
      regiao('Consumo dos últimos 12 meses').getByRole('button', { name: 'Ver como tabela' }),
    )
    const consumo = linhas('Consumo dos últimos 12 meses')
    expect(consumo).toHaveLength(12) // eixo fixo, mês sem dado não some
    expect(consumo.slice(0, 6).every((l) => within(l).queryByText('Sem dado'))).toBe(true)
    expect(within(consumo[0]).getAllByText('—')).toHaveLength(2) // nunca 0

    // Duas tabelas no bloco: conta as faturas pelo valor, um por linha (1 em aberto + 5 pagas).
    expect(regiao('Faturas').getAllByText(/^R\$ /)).toHaveLength(6)
    expect(regiao('Faturas').getByText('Em aberto')).toBeTruthy()
    expect(
      regiao('Interrupções de energia').getByRole('heading', {
        name: 'Nenhuma interrupção no período',
      }),
    ).toBeTruthy()
    expect(regiao('Chamados').getByText('Sem nota')).toBeTruthy()
  })
})

describe('faturas em aberto antes do período', () => {
  it('a dívida antiga aparece com o selo "Antes do período"; a do período, sem selo', () => {
    const [aberta] = unidadeFixture.faturas_abertas as Fatura[]
    const antiga: Fatura = { ...aberta, id_fatura: 'FT-ANTIGA', mes_referencia: '2024-11' }
    render(<BlocoFaturas abertas={[aberta, antiga]} pagas={[]} periodo="2025-07/2026-06" />)
    expect(screen.getAllByText('Antes do período')).toHaveLength(1)
    expect(
      within(screen.getByText('Nov/2024').closest('tr')!).getByText('Antes do período'),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Nenhuma fatura paga no período' })).toBeTruthy()
  })
})

describe('gráfico de consumo de 12 meses', () => {
  const regiaoConsumo = () =>
    within(screen.getByRole('region', { name: 'Consumo dos últimos 12 meses' }))
  const barras = (serie: 'atual' | 'anterior') =>
    document.querySelectorAll(`[data-serie="${serie}"]`).length

  it('UC completa: 12 meses com as duas barras, legenda, aviso de estimada e um só rótulo de valor', async () => {
    abrir('/unidades/UC-DEMO-001')
    await screen.findByRole('heading', { name: 'Titular de exemplo 001' })
    const c = regiaoConsumo()
    expect(document.querySelectorAll('[data-ponto]')).toHaveLength(12)
    expect([barras('atual'), barras('anterior')]).toEqual([12, 12])
    expect(c.getByText('Consumo do mês')).toBeTruthy()
    expect(c.getByText('Mesmo mês do ano anterior')).toBeTruthy()
    expect(c.getAllByText('estimada')).toHaveLength(1) // só jun/2026
    expect(c.getByText('“estimada”: leitura estimada no mês')).toBeTruthy()
    expect(c.getByText('412 kWh')).toBeTruthy() // rótulo só no último mês
    expect(
      c.getByRole('img', {
        name: 'Jun/2026; Consumo do mês: 412 kWh; Mesmo mês do ano anterior: 298 kWh; estimada',
      }),
    ).toBeTruthy()
  })

  it('UC recente: meses sem dado viram lacuna, nunca barra zero', async () => {
    abrir('/unidades/UC-DEMO-007')
    await screen.findByRole('heading', { name: 'Titular de exemplo 007' })
    expect(regiaoConsumo().getAllByText('sem dado')).toHaveLength(6)
    expect([barras('atual'), barras('anterior')]).toEqual([6, 0]) // sem ano anterior
    expect(
      regiaoConsumo().getByRole('img', {
        name: 'Jul/2025; Consumo do mês: sem dado; Mesmo mês do ano anterior: sem dado',
      }),
    ).toBeTruthy()
  })

  it('alterna entre gráfico e tabela', async () => {
    abrir('/unidades/UC-DEMO-001')
    await screen.findByRole('heading', { name: 'Titular de exemplo 001' })
    fireEvent.click(regiaoConsumo().getByRole('button', { name: 'Ver como tabela' }))
    expect(regiaoConsumo().getByRole('table')).toBeTruthy()
    expect(document.querySelectorAll('[data-ponto]')).toHaveLength(0)
    fireEvent.click(regiaoConsumo().getByRole('button', { name: 'Ver gráfico' }))
    expect(document.querySelectorAll('[data-ponto]')).toHaveLength(12)
  })

  it('o ano aparece no primeiro mês e em janeiro', () => {
    const pontos = pontosDoConsumo((unidadeFixture as Unidade360).consumo)
    expect(pontos.map((p) => p.rotuloSecundario).filter(Boolean)).toEqual(['2025', '2026'])
    expect(pontos[0]).toMatchObject({ rotulo: 'Jul', rotuloCompleto: 'Jul/2025', aviso: null })
    expect(pontos[11].aviso).toBe('estimada')
  })
})

describe('geometria da barra', () => {
  it('topo arredondado em até 4 px e base reta na linha do zero', () => {
    expect(caminhoBarra(10, 20, 12, 100)).toBe('M10,120 V24 Q10,20 14,20 H18 Q22,20 22,24 V120 Z')
    expect(caminhoBarra(0, 0, 12, 2)).toBe('M0,2 V2 Q0,0 2,0 H10 Q12,0 12,2 V2 Z') // barra baixa
  })
})

describe('tabelas na largura do cartão com colunas proporcionais', () => {
  const larguras = (tabela: HTMLElement) =>
    within(tabela)
      .getAllByRole('columnheader')
      .map((th) => th.style.width)

  /** Contêiner do Tabela, onde ficam as classes que valem para a tabela interna. */
  const conteinerComClasse = (tabela: HTMLElement, classe: string) => {
    let conteiner: HTMLElement | null = tabela.parentElement
    while (conteiner && !conteiner.classList.contains(classe)) conteiner = conteiner.parentElement
    return conteiner
  }

  it('faturas: valor antes da bandeira, com recuo nela, e as duas tabelas alinhadas', async () => {
    abrir('/unidades/UC-DEMO-001')
    await screen.findByRole('heading', { name: 'Titular de exemplo 001' })
    const [abertas, pagas] = within(screen.getByRole('region', { name: 'Faturas' })).getAllByRole(
      'table',
    )
    for (const tabela of [abertas, pagas]) {
      const cabecalhos = within(tabela)
        .getAllByRole('columnheader')
        .map((th) => th.textContent)
      expect(cabecalhos.slice(2)).toEqual(['Valor total', 'Bandeira'])
      // Bandeira centralizada (cabeçalho e selos), sem recuo na 4ª coluna.
      expect(within(tabela).getByRole('columnheader', { name: 'Bandeira' }).className).toContain(
        'text-center',
      )
      for (const linha of within(tabela).getAllByRole('row').slice(1)) {
        expect(within(linha).getAllByRole('cell')[3].className).toContain('text-center')
      }
      expect(conteinerComClasse(tabela, '[&_td:nth-child(4)]:pl-8')).toBeNull()
    }
    expect(larguras(abertas)).toEqual(['26%', '20%', '16%', '38%'])
    expect(larguras(pagas)).toEqual(larguras(abertas)) // colunas alinhadas uma embaixo da outra
    expect(within(abertas).getByText('R$ 486,00').closest('td')!.className).toContain('text-right')
    // Bandeira como selo oval com o nome dentro: Amarela em amarelo (aberta), Verde em verde (paga).
    const amarela = within(abertas).getByText('Amarela')
    expect(amarela.className).toContain('rounded-full')
    expect(amarela.className).toContain('bg-alerta-suave')
    expect(within(pagas).getByText('Verde').className).toContain('bg-sucesso-suave')
  })

  it('selo da bandeira: as 4 da Gold com as variantes do Badge e desconhecida como neutra', () => {
    expect(estiloBandeira('VERDE')).toEqual({ variante: 'sucesso' })
    expect(estiloBandeira('AMARELA')).toEqual({ variante: 'alerta' })
    expect(estiloBandeira('VERMELHA P1')).toEqual({ variante: 'perigo' })
    expect(estiloBandeira('VERMELHA P2')).toEqual({
      variante: 'perigo',
      className: 'bg-perigo-escuro! text-ink-inverso!', // vermelho mais forte que a P1
    })
    expect(estiloBandeira('ESCASSEZ HIDRICA')).toEqual({ variante: 'neutro' })
    expect(estiloBandeira('toString')).toEqual({ variante: 'neutro' })
  })

  it('a P2 aparece como selo vermelho forte com o nome dentro', () => {
    const [aberta] = unidadeFixture.faturas_abertas as Fatura[]
    render(
      <BlocoFaturas
        abertas={[{ ...aberta, bandeira_tarifaria: 'VERMELHA P2' }]}
        pagas={[]}
        periodo="2025-07/2026-06"
      />,
    )
    const selo = screen.getByText('Vermelha P2')
    expect(selo.className).toContain('bg-perigo-escuro!')
    expect(selo.className).toContain('text-ink-inverso!')
  })

  it('todas as tabelas: largura do cartão, table-fixed e porcentagens que somam 100%', async () => {
    abrir('/unidades/UC-DEMO-001')
    await screen.findByRole('heading', { name: 'Titular de exemplo 001' })
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }))
    const tabelas = screen.getAllByRole('table')
    expect(tabelas).toHaveLength(5) // consumo, 2 de faturas, interrupções e chamados
    for (const tabela of tabelas) {
      const soma = larguras(tabela).reduce((total, l) => total + Number.parseFloat(l), 0)
      expect(soma).toBe(100)
      expect(tabela.className).toContain('w-full') // barra do cabeçalho de ponta a ponta
      expect(conteinerComClasse(tabela, '[&_table]:table-fixed')).toBeTruthy()
    }
    // Recuo só no consumo (leitura depois de número à direita); nas faturas a bandeira é centralizada.
    expect(tabelas.map((t) => Boolean(conteinerComClasse(t, '[&_td:nth-child(4)]:pl-8')))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ])
  })
})
