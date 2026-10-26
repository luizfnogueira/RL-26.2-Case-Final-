import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../erro-api'
import {
  atualizarInspecao,
  buscarCandidatos,
  buscarDashboard,
  buscarOperacao,
  buscarUnidade,
  buscarUnidades,
  cancelarInspecao,
  concluirInspecao,
  criarInspecao,
  gerarInsight,
  iniciarCampo,
  listarInspecoes,
  perguntarIA,
} from '..'
import { atenderMock, reiniciarOrdens } from '.'

const ATUAL = '2025-07/2026-06'
const COMPARACAO = '2022-07/2023-06'
const DASH = { periodo_atual: ATUAL, periodo_comparacao: COMPARACAO }
const CONTEXTO = { periodo_atual: ATUAL, periodo_comparacao: COMPARACAO }
const NOVA = {
  id_uc: 'UC-DEMO-001',
  equipe_responsavel: 'Equipe Norte 02',
  data_prevista: '2026-10-22',
}

async function erroDe(promessa: Promise<unknown>): Promise<ApiError> {
  try {
    await promessa
  } catch (erro) {
    expect(erro).toBeInstanceOf(ApiError)
    return erro as ApiError
  }
  throw new Error('A chamada deveria ter falhado.')
}

beforeEach(() => reiniciarOrdens())

describe('GET /dashboard', () => {
  it('devolve seis KPIs, 48 pontos de série e uma ponte que fecha', async () => {
    const d = await buscarDashboard(DASH)
    expect(Object.keys(d.indicadores)).toEqual([
      'receita_faturada',
      'energia_faturada',
      'ucs_ativas',
      'inadimplencia',
      'dec_medio',
      'fec_medio',
    ])
    expect(d.serie_historica).toHaveLength(48)
    const p = d.ponte_receita
    expect(Object.keys(p)).not.toContain('bandeira_mix')
    const soma =
      (p.receita_energia_comparacao.valor ?? 0) +
      (p.efeito_preco.valor ?? 0) +
      (p.efeito_volume.valor ?? 0)
    expect(soma).toBeCloseTo(p.receita_energia_atual.valor ?? 0, 1)
    expect(d.metadados.dados_ficticios).toBe(true)
  })

  it('ordena o drill-down pela maior queda de volume', async () => {
    const d = await buscarDashboard(DASH)
    const quedas = d.drill_down.items.map((l) => l.queda_kwh.valor ?? 0)
    expect(quedas).toEqual([...quedas].sort((a, b) => b - a))
    expect(d.drill_down.nivel).toBe('municipio')
    expect(d.drill_down.breadcrumb.map((b) => b.nivel)).toEqual(['consolidado'])
  })

  it('desce para bairro com breadcrumb, preserva a soma da ponte e zera DEC/FEC do recorte', async () => {
    const consolidado = await buscarDashboard(DASH)
    const municipio = consolidado.drill_down.items[0].nome
    const d = await buscarDashboard({ ...DASH, nivel: 'bairro', municipio })
    expect(d.drill_down.nivel).toBe('bairro')
    expect(d.drill_down.breadcrumb.map((b) => b.rotulo)).toEqual(['Todos os municípios', municipio])
    expect(d.drill_down.items.every((l) => l.filtros.municipio === municipio)).toBe(true)
    expect(d.indicadores.dec_medio.atual.valor).toBeNull()
    const p = d.ponte_receita
    const soma =
      (p.receita_energia_comparacao.valor ?? 0) +
      (p.efeito_preco.valor ?? 0) +
      (p.efeito_volume.valor ?? 0)
    expect(soma).toBeCloseTo(p.receita_energia_atual.valor ?? 0, 1)
  })

  it('a ponte do consolidado coincide com o fixture e a soma das linhas fecha', async () => {
    const d = await buscarDashboard({ ...DASH, page_size: 100 })
    const base = (await import('@/data/mocks/dashboard.json')).default
    const p = d.ponte_receita
    expect(p.receita_energia_atual.valor).toBeCloseTo(
      base.ponte_receita.receita_energia_atual.valor,
      0,
    )
    expect(p.efeito_preco.valor).toBeCloseTo(base.ponte_receita.efeito_preco.valor, 0)
    expect(p.efeito_volume.valor).toBeCloseTo(base.ponte_receita.efeito_volume.valor, 0)
    const linhas = d.drill_down.items
    const preco = linhas.reduce((s, l) => s + (l.efeito_preco.valor ?? 0), 0)
    expect(preco).toBeCloseTo(p.efeito_preco.valor ?? 0, 0)
  })

  it('rejeita períodos fora do cenário e combinações inválidas', async () => {
    expect(
      (await erroDe(buscarDashboard({ ...DASH, periodo_atual: '2024-07/2025-06' }))).codigo,
    ).toBe('CENARIO_STUB_INDISPONIVEL')
    const mesmo = await erroDe(buscarDashboard({ ...DASH, periodo_comparacao: ATUAL }))
    expect([mesmo.status, mesmo.codigo]).toEqual([422, 'DADOS_INVALIDOS'])
    expect(
      (await erroDe(buscarDashboard({ ...DASH, nivel: 'classe', municipio: 'Recife' }))).status,
    ).toBe(422)
    expect((await erroDe(buscarDashboard({ ...DASH, page_size: 500 }))).codigo).toBe(
      'DADOS_INVALIDOS',
    )
  })

  it('devolve cópias independentes: alterar o resultado não afeta a próxima chamada', async () => {
    const a = await buscarDashboard(DASH)
    a.serie_historica.length = 0
    const b = await buscarDashboard(DASH)
    expect(b.serie_historica).toHaveLength(48)
  })
})

describe('GET /unidades', () => {
  it('busca por ID ou titular e devolve lista vazia sem correspondência', async () => {
    const todas = await buscarUnidades({})
    expect(todas.total).toBe(8)
    const uma = await buscarUnidades({ busca: 'demo-001' })
    expect(uma.items.map((u) => u.id_uc)).toEqual(['UC-DEMO-001'])
    const nenhuma = await buscarUnidades({ busca: 'inexistente' })
    expect(nenhuma).toMatchObject({ items: [], total: 0 })
  })

  it('só UC-DEMO-001 tem visão 360; outras UCs dão 404', async () => {
    const uc = await buscarUnidade('UC-DEMO-001', { periodo_atual: ATUAL })
    expect(uc.consumo).toHaveLength(12)
    expect(uc.diagnostico_conta.leitura_estimada).toEqual(expect.any(Boolean))
    const erro = await erroDe(buscarUnidade('UC-DEMO-002'))
    expect([erro.status, erro.codigo]).toEqual([404, 'UC_INEXISTENTE'])
  })
})

describe('GET /inspecoes/candidatos', () => {
  it('ordena por score, numera a posição e marca ordem ativa', async () => {
    const c = await buscarCandidatos({ periodo_atual: ATUAL })
    const scores = c.items.map((i) => i.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(c.items.map((i) => i.posicao)).toEqual(c.items.map((_, i) => i + 1))
    const ativa = c.items.find((i) => i.id_uc === 'UC-DEMO-002')
    expect(ativa).toMatchObject({ ordem_ativa: true, id_ordem_ativa: 1 })
    expect(c.resumo.ordens_ativas.valor).toBe(c.items.filter((i) => i.ordem_ativa).length)
  })

  it('pagina e filtra por região', async () => {
    const pagina = await buscarCandidatos({ periodo_atual: ATUAL, page: 2, page_size: 3 })
    expect(pagina.items).toHaveLength(3)
    expect(pagina.total).toBe(8)
    const recife = await buscarCandidatos({ periodo_atual: ATUAL, municipio: 'Recife' })
    expect(recife.items.every((i) => i.municipio === 'Recife')).toBe(true)
  })

  it('exige periodo_atual', async () => {
    const erro = await erroDe(atenderMock('GET', '/inspecoes/candidatos', { params: {} }))
    expect(erro.codigo).toBe('DADOS_INVALIDOS')
  })
})

describe('ordens de inspeção', () => {
  it('lista o snapshot com contagem por status e filtra por status', async () => {
    const todas = await listarInspecoes()
    expect(todas.total).toBe(4)
    expect(todas.contagem_status).toEqual({ ABERTA: 1, EM_CAMPO: 1, CONCLUIDA: 1, CANCELADA: 1 })
    const campo = await listarInspecoes({ status: 'EM_CAMPO' })
    expect(campo.items.map((o) => o.id_ordem)).toEqual([2])
    expect(campo.contagem_status.ABERTA).toBe(1) // a contagem ignora o filtro de status
  })

  it('cria a ordem em ABERTA com histórico, e a fila passa a marcá-la como ativa', async () => {
    const ordem = await criarInspecao({ ...NOVA, motivo: 'Verificar variação de consumo.' })
    expect(ordem).toMatchObject({ status: 'ABERTA', id_uc: 'UC-DEMO-001', id_ordem: 5 })
    expect(ordem.historico).toHaveLength(1)
    expect(ordem.historico[0]).toMatchObject({ status_anterior: null, status_novo: 'ABERTA' })
    const fila = await buscarCandidatos({ periodo_atual: ATUAL })
    expect(fila.items.find((i) => i.id_uc === 'UC-DEMO-001')).toMatchObject({
      ordem_ativa: true,
      id_ordem_ativa: 5,
    })
    expect((await listarInspecoes()).contagem_status.ABERTA).toBe(2)
  })

  it('bloqueia segunda ordem ativa na mesma UC (409) e UC inexistente (404)', async () => {
    await criarInspecao(NOVA)
    const dupla = await erroDe(criarInspecao(NOVA))
    expect([dupla.status, dupla.codigo]).toEqual([409, 'ORDEM_ATIVA_EXISTENTE'])
    const existente = await erroDe(criarInspecao({ ...NOVA, id_uc: 'UC-DEMO-002' }))
    expect(existente.status).toBe(409)
    const nenhuma = await erroDe(criarInspecao({ ...NOVA, id_uc: 'UC-XXX' }))
    expect([nenhuma.status, nenhuma.codigo]).toEqual([404, 'UC_INEXISTENTE'])
  })

  it('valida os campos obrigatórios da criação (422)', async () => {
    expect((await erroDe(criarInspecao({ ...NOVA, equipe_responsavel: ' ' }))).status).toBe(422)
    expect((await erroDe(criarInspecao({ ...NOVA, data_prevista: '22/10/2026' }))).codigo).toBe(
      'DADOS_INVALIDOS',
    )
  })

  it('segue o fluxo ABERTA → EM_CAMPO → CONCLUIDA com resultado e histórico', async () => {
    const campo = await iniciarCampo(1, { equipe_responsavel: 'Equipe Sul 04' })
    expect(campo).toMatchObject({ status: 'EM_CAMPO', equipe_responsavel: 'Equipe Sul 04' })
    expect(campo.data_inicio_campo).not.toBeNull()
    const ordem = await concluirInspecao(1, {
      irregularidade_detectada: true,
      tipo_irregularidade: ' by-pass ',
      kwh_recuperado: 120,
      observacoes: 'Ligação direta encontrada.',
    })
    expect(ordem.status).toBe('CONCLUIDA')
    expect(ordem.resultado).toMatchObject({ tipo_irregularidade: 'BY-PASS', kwh_recuperado: 120 })
    expect(ordem.historico.map((h) => h.status_novo)).toEqual(['ABERTA', 'EM_CAMPO', 'CONCLUIDA'])
  })

  it('recusa transições inválidas (400) e ordem inexistente (404)', async () => {
    const resultado = { irregularidade_detectada: false, observacoes: 'Nada encontrado.' }
    expect((await erroDe(concluirInspecao(1, resultado))).codigo).toBe('TRANSICAO_INVALIDA')
    expect((await erroDe(iniciarCampo(2))).codigo).toBe('TRANSICAO_INVALIDA')
    expect((await erroDe(cancelarInspecao(3, 'Tarde demais.'))).codigo).toBe('TRANSICAO_INVALIDA')
    expect((await erroDe(atualizarInspecao(1, { status: 'ABERTA' } as never))).codigo).toBe(
      'TRANSICAO_INVALIDA',
    )
    expect((await erroDe(cancelarInspecao(99, 'x'))).codigo).toBe('ORDEM_NAO_ENCONTRADA')
  })

  it('exige justificativa no cancelamento e resultado na conclusão (400)', async () => {
    const semJustificativa = await erroDe(
      atenderMock('PATCH', '/inspecoes/1', { corpo: { status: 'CANCELADA' } }),
    )
    expect([semJustificativa.status, semJustificativa.codigo]).toEqual([
      400,
      'JUSTIFICATIVA_OBRIGATORIA',
    ])
    const semResultado = await erroDe(
      atenderMock('PATCH', '/inspecoes/2', { corpo: { status: 'CONCLUIDA' } }),
    )
    expect([semResultado.status, semResultado.codigo]).toEqual([400, 'RESULTADO_INCOMPLETO'])
  })

  it('rejeita resultado inconsistente (422) e combinações de campos inválidas', async () => {
    const semIrregularidadeComKwh = await erroDe(
      concluirInspecao(2, {
        irregularidade_detectada: false,
        kwh_recuperado: 10,
        observacoes: 'x',
      }),
    )
    expect([semIrregularidadeComKwh.status, semIrregularidadeComKwh.codigo]).toEqual([
      422,
      'DADOS_INVALIDOS',
    ])
    expect(
      (await erroDe(concluirInspecao(2, { irregularidade_detectada: true, observacoes: 'x' })))
        .status,
    ).toBe(422)
    expect(
      (await erroDe(concluirInspecao(2, { irregularidade_detectada: false, observacoes: '' })))
        .status,
    ).toBe(422)
    const combinacao = await erroDe(
      atenderMock('PATCH', '/inspecoes/1', {
        corpo: { status: 'CANCELADA', justificativa: 'x', resultado: {} },
      }),
    )
    expect(combinacao.status).toBe(422)
  })

  it('cancela com justificativa e libera a UC para uma nova ordem', async () => {
    const ordem = await cancelarInspecao(1, 'Ordem criada em duplicidade.')
    expect(ordem).toMatchObject({
      status: 'CANCELADA',
      justificativa_cancelamento: 'Ordem criada em duplicidade.',
    })
    const nova = await criarInspecao({ ...NOVA, id_uc: 'UC-DEMO-002' })
    expect(nova.status).toBe('ABERTA')
  })

  it('reiniciarOrdens volta ao snapshot original', async () => {
    await criarInspecao(NOVA)
    reiniciarOrdens()
    expect((await listarInspecoes()).total).toBe(4)
  })
})

describe('GET /operacao', () => {
  it('ordena os rankings pelo indicador escolhido', async () => {
    const dec = await buscarOperacao({ periodo_atual: ATUAL })
    const valores = dec.ranking_alimentadores.items.map((a) => a.dec.valor ?? 0)
    expect(valores).toEqual([...valores].sort((a, b) => b - a))
    expect(dec.ranking_alimentadores.items.map((a) => a.posicao)).toEqual([1, 2, 3, 4, 5])
    const fec = await buscarOperacao({ periodo_atual: ATUAL, ordenar_por: 'fec' })
    const fecs = fec.ranking_alimentadores.items.map((a) => a.fec.valor ?? 0)
    expect(fecs).toEqual([...fecs].sort((a, b) => b - a))
    const chi = await buscarOperacao({ periodo_atual: ATUAL, ordenar_por: 'chi' })
    const horas = chi.ranking_alimentadores.items.map((a) => a.horas_interrupcao.valor ?? 0)
    expect(horas).toEqual([...horas].sort((a, b) => b - a))
    expect(chi.filtros.ordenar_por).toBe('chi')
    const invalido = buscarOperacao({ periodo_atual: ATUAL, ordenar_por: 'x' as 'dec' })
    expect((await erroDe(invalido)).codigo).toBe('DADOS_INVALIDOS')
  })

  it('traz DEC/FEC sem dia crítico e horas de interrupção nos rankings regionais', async () => {
    const o = await buscarOperacao({ periodo_atual: ATUAL })
    for (const r of o.ranking_regional.items) {
      expect(r.dec_sem_dia_critico.valor).not.toBeNull()
      expect(r.horas_interrupcao.unidade).toBe('h')
    }
  })

  it('filtra por alimentador (série e rankings) e muda o nível regional', async () => {
    const um = await buscarOperacao({ periodo_atual: ATUAL, alimentador: 'ALM-DEMO-003' })
    expect(um.serie_historica.map((s) => s.alimentador)).toEqual(['ALM-DEMO-003'])
    expect(um.ranking_alimentadores.total).toBe(1)
    const bairro = await buscarOperacao({ periodo_atual: ATUAL, nivel_regional: 'bairro' })
    expect(bairro.ranking_regional.nivel_regional).toBe('bairro')
    expect(bairro.ranking_regional.items.every((r) => r.bairro !== null)).toBe(true)
  })

  it('recusa o filtro classe e alimentadores inexistentes', async () => {
    expect(
      (await erroDe(buscarOperacao({ periodo_atual: ATUAL, classe: 'Residencial' }))).codigo,
    ).toBe('CENARIO_STUB_INDISPONIVEL')
    expect(
      (await erroDe(buscarOperacao({ periodo_atual: ATUAL, alimentador: 'XYZ' }))).status,
    ).toBe(422)
  })
})

describe('POST /ia', () => {
  it('responde ok à pergunta do cenário, com sql, tabelas e dados', async () => {
    const r = await perguntarIA('Qual foi a receita no período?', CONTEXTO)
    expect(r.status).toBe('ok')
    expect(r.sql).toEqual(expect.any(String))
    expect(r.tabelas.length).toBeGreaterThan(0)
    expect(r.dados.linhas.every((l) => l.length === r.dados.colunas.length)).toBe(true)
  })

  it('responde nao_sei fora do cenário e bloqueado a comandos destrutivos', async () => {
    expect((await perguntarIA('Qual a previsão de lucro em 2030?')).status).toBe('nao_sei')
    expect((await perguntarIA('Qual foi a receita no período?')).status).toBe('nao_sei') // sem o contexto
    expect((await perguntarIA('DROP TABLE clientes')).status).toBe('bloqueado')
    expect((await perguntarIA('Apague as faturas de 2022 do banco de dados')).status).toBe(
      'bloqueado',
    )
  })

  it('responde as perguntas sugeridas da tela do assistente com dados consistentes', async () => {
    for (const pergunta of [
      'Quais bairros tiveram mais falta de luz este ano?',
      'Quais UCs têm maior risco de perda?',
      'Por que a conta de luz aumentou?',
    ]) {
      const r = await perguntarIA(pergunta)
      expect(r.status, pergunta).toBe('ok')
      expect(r.dados.linhas.length, pergunta).toBeGreaterThan(0)
      expect(r.metadados.dados_ficticios).toBe(true)
    }
  })

  it('valida a pergunta (422)', async () => {
    expect((await erroDe(perguntarIA('   '))).status).toBe(422)
    expect((await erroDe(perguntarIA('x'.repeat(2001)))).status).toBe(422)
  })
})

describe('POST /ia/insight', () => {
  const receita = { contexto: 'receita' as const, filtros: CONTEXTO }

  it('gera o insight da receita com os seis números do cenário', async () => {
    const i = await gerarInsight(receita)
    expect(i.numeros_utilizados.map((n) => n.nome)).toEqual([
      'receita_energia_atual',
      'receita_energia_comparacao',
      'variacao_volume',
      'reajuste',
      'efeito_preco',
      'efeito_volume',
    ])
    expect(i.texto).toContain('efeito-preço')
    expect(i.metadados.dados_ficticios).toBe(true)
  })

  it('aceita indicadores coerentes e recusa os divergentes (422)', async () => {
    const base = await gerarInsight(receita)
    expect(
      (await gerarInsight({ ...receita, indicadores: base.numeros_utilizados })).titulo,
    ).toBeTruthy()
    const adulterados = base.numeros_utilizados.map((n) => ({ ...n, valor: (n.valor ?? 0) + 1000 }))
    expect((await erroDe(gerarInsight({ ...receita, indicadores: adulterados }))).codigo).toBe(
      'DADOS_INVALIDOS',
    )
  })

  it('gera o resumo da unidade com os quatro números do diagnóstico', async () => {
    const i = await gerarInsight({
      contexto: 'unidade',
      filtros: { periodo_atual: ATUAL },
      id_uc: 'UC-DEMO-001',
    })
    expect(i.numeros_utilizados.map((n) => n.nome)).toEqual([
      'ultimo_mes',
      'mesmo_mes_ano_anterior',
      'media_12_meses',
      'variacao_percentual',
    ])
    const uc = await buscarUnidade('UC-DEMO-001')
    expect(i.numeros_utilizados[0].valor).toBe(uc.diagnostico_conta.ultimo_mes.valor)
  })

  it('valida o pedido', async () => {
    const semUc = await erroDe(
      gerarInsight({ contexto: 'unidade', filtros: { periodo_atual: ATUAL } }),
    )
    expect(semUc.status).toBe(422)
    const ucFora = await erroDe(
      gerarInsight({ contexto: 'unidade', filtros: { periodo_atual: ATUAL }, id_uc: 'UC-X' }),
    )
    expect(ucFora.status).toBe(404)
    const semComparacao = await erroDe(
      gerarInsight({ contexto: 'receita', filtros: { periodo_atual: ATUAL } }),
    )
    expect(semComparacao.status).toBe(422)
  })
})

describe('roteamento', () => {
  it('responde /health, 404 para rota desconhecida e 405 para método errado', async () => {
    expect(await atenderMock('GET', '/health')).toEqual({ status: 'ok' })
    expect((await erroDe(atenderMock('GET', '/nada'))).status).toBe(404)
    expect((await erroDe(atenderMock('POST', '/dashboard', { corpo: {} }))).status).toBe(405)
    expect((await erroDe(atenderMock('POST', '/inspecoes'))).status).toBe(422)
  })

  it('cancela a requisição quando o sinal já foi abortado', async () => {
    const controle = new AbortController()
    controle.abort()
    await expect(atenderMock('GET', '/health', { sinal: controle.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
