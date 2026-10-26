// Respostas pré-definidas do assistente e do insight. Porta de backend/app/services/stub_ia.py.
// Não há agente, SQL executado nem parser de segurança: a demonstração de bloqueio não substitui
// as proteções da integração real.
import type { IndicadorNomeado } from '@/types/comum'
import type { RespostaIA, RespostaInsight } from '@/types/ia'
import { fixtures } from './fixtures'
import { agoraIso, erroApi, verificarCenario, type Registro } from './util'
import { compararPeriodos, invalido, periodo, regiao, texto } from './validacao'
import { montarDashboard } from './dashboard'

const PERGUNTA_OK = 'qual foi a receita no período?'
const PERGUNTA_BLOQUEADA = 'drop table clientes'
const DESTRUTIVA = /\b(drop|delete|truncate|apague|apagar|exclua|excluir|remova|remover)\b/i
const UC_INSIGHT = 'UC-DEMO-001'
const NUMEROS_UNIDADE = [
  ['ultimo_mes', 'Último mês'],
  ['mesmo_mes_ano_anterior', 'Mesmo mês do ano anterior'],
  ['media_12_meses', 'Média de 12 meses'],
  ['variacao_percentual', 'Variação sobre o ano anterior'],
] as const

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[?!.]+$/, '')
    .trim()
}

function numero(valor: number, casas = 1): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

// ---------- POST /ia ----------

/** Respostas extras do mock do front (não fazem parte dos fixtures do contrato), montadas com os mesmos dados fictícios. */
async function respostaExtra(pergunta: string): Promise<RespostaIA | null> {
  const base = await fixtures.respostaIa()
  const montar = (r: Pick<RespostaIA, 'resposta' | 'sql' | 'tabelas' | 'dados'>): RespostaIA => ({
    ...r,
    status: 'ok',
    gerado_em: agoraIso(),
    metadados: {
      ...base.metadados,
      observacoes: ['Resposta fictícia pré-definida do mock do front; SQL e tabelas ilustrativos.'],
    },
  })

  if (pergunta === 'quais bairros tiveram mais falta de luz este ano') {
    const { ranking_alimentadores } = await fixtures.operacao()
    const top = [...ranking_alimentadores.items]
      .sort((a, b) => (b.dec.valor ?? 0) - (a.dec.valor ?? 0))
      .slice(0, 3)
    const [a, b] = top
    return montar({
      resposta:
        `Os alimentadores com maior DEC no período foram ${a.alimentador} (${a.municipio}), com ${numero(a.dec.valor ?? 0)} h por UC, ` +
        `e ${b.alimentador} (${b.municipio}), com ${numero(b.dec.valor ?? 0)} h. Eles atendem ${a.bairros_atendidos.join(', ')} e ${b.bairros_atendidos.join(', ')}.`,
      sql: 'SELECT alimentador, municipio, dec, fec, interrupcoes FROM gold_operacao_demo ORDER BY dec DESC LIMIT 3',
      tabelas: ['gold_operacao_demo'],
      dados: {
        colunas: ['alimentador', 'municipio', 'dec_h_uc', 'fec_int_uc', 'interrupcoes'],
        linhas: top.map((x) => [
          x.alimentador,
          x.municipio,
          x.dec.valor,
          x.fec.valor,
          x.interrupcoes.valor,
        ]),
      },
    })
  }
  if (pergunta === 'quais ucs tem maior risco de perda') {
    const { items } = await fixtures.candidatos()
    const top = [...items].sort((x, y) => y.score - x.score).slice(0, 3)
    return montar({
      resposta: `As UCs com maior risco de perda são ${top.map((c) => `${c.id_uc} (${c.bairro}, score ${numero(c.score)})`).join(', ')}. O motivo principal da primeira é: ${top[0].motivos[0]}.`,
      sql: 'SELECT id_uc, bairro, score, energia_estimada FROM gold_fila_perdas_demo ORDER BY score DESC LIMIT 3',
      tabelas: ['gold_fila_perdas_demo'],
      dados: {
        colunas: ['id_uc', 'bairro', 'score', 'energia_estimada_kwh'],
        linhas: top.map((c) => [c.id_uc, c.bairro, c.score, c.energia_estimada.valor]),
      },
    })
  }
  if (pergunta === 'por que a conta de luz aumentou') {
    const { ponte_receita: p } = await fixtures.dashboard()
    const milhoes = (v: number | null) => numero((v ?? 0) / 1_000_000)
    return montar({
      resposta:
        `A receita de energia passou de R$ ${milhoes(p.receita_energia_comparacao.valor)} milhões para R$ ${milhoes(p.receita_energia_atual.valor)} milhões. ` +
        `O reajuste de ${numero(p.reajuste_percentual.valor ?? 0)}% explica R$ ${milhoes(p.efeito_preco.valor)} milhões; a queda de volume retirou R$ ${milhoes(Math.abs(p.efeito_volume.valor ?? 0))} milhões.`,
      sql: 'SELECT efeito, valor_brl FROM gold_receita_demo ORDER BY ordem',
      tabelas: ['gold_receita_demo'],
      dados: {
        colunas: ['efeito', 'valor_brl'],
        linhas: [
          ['Receita de energia base', p.receita_energia_comparacao.valor],
          ['Efeito-preço', p.efeito_preco.valor],
          ['Efeito-volume', p.efeito_volume.valor],
          ['Receita de energia atual', p.receita_energia_atual.valor],
        ],
      },
    })
  }
  return null
}

export async function responderPergunta(corpo: Registro): Promise<RespostaIA> {
  const bruta = corpo.pergunta
  if (typeof bruta !== 'string' || bruta.trim().length < 1 || bruta.length > 2000) {
    throw invalido('pergunta deve ter de 1 a 2000 caracteres.')
  }
  // Como a API (extra='forbid'): o corpo é só {pergunta}
  const extras = Object.keys(corpo).filter((campo) => campo !== 'pergunta')
  if (extras.length > 0) throw invalido(`Campo não permitido: ${extras.join(', ')}.`)

  const pergunta = bruta.trim().toLocaleLowerCase('pt-BR')
  if (pergunta === PERGUNTA_BLOQUEADA || DESTRUTIVA.test(bruta))
    return fixtures.respostaIaBloqueado()
  if (pergunta === PERGUNTA_OK) return fixtures.respostaIa()
  return (await respostaExtra(normalizar(bruta))) ?? fixtures.respostaIaNaoSei()
}

// ---------- POST /ia/insight ----------

function brl(valor: number): string {
  const sinal = valor < 0 ? '−' : ''
  const v = Math.abs(valor)
  const texto =
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)} milhões`
      : v >= 1_000
        ? `${(v / 1_000).toFixed(1)} mil`
        : v.toFixed(2)
  return `${sinal}R$ ${texto.replace('.', ',')}`
}

function pct(valor: number, comSinal = true): string {
  const t = comSinal && valor >= 0 ? `+${valor.toFixed(1)}` : valor.toFixed(1)
  return `${t.replace('.', ',').replace('-', '−')}%`
}

/** Indicadores enviados pelo front são opcionais, mas se vierem precisam bater com o cenário. */
function conferir(enviados: unknown, esperados: IndicadorNomeado[]) {
  if (!Array.isArray(enviados) || enviados.length === 0) return
  const recebidos = new Map((enviados as IndicadorNomeado[]).map((i) => [i.nome, i]))
  const iguais =
    recebidos.size === esperados.length &&
    esperados.every((e) => {
      const r = recebidos.get(e.nome)
      return (
        r !== undefined &&
        Math.abs((r.valor ?? 0) - (e.valor ?? 0)) <= 0.01 &&
        r.unidade === e.unidade &&
        r.periodo_referencia === e.periodo_referencia
      )
    })
  if (!iguais) throw invalido('Os indicadores enviados não correspondem ao cenário consultado.')
}

async function insightReceita(corpo: Registro, filtros: Registro): Promise<RespostaInsight> {
  if (corpo.id_uc !== undefined && corpo.id_uc !== null)
    throw invalido('Insight de receita não aceita id_uc.')
  if (texto(filtros, 'periodo_comparacao') === undefined)
    throw invalido('Insight de receita exige periodo_comparacao.')
  const dashboard = await montarDashboard(filtros)
  const p = dashboard.ponte_receita
  // Como a API real: sem decomposição na Gold (ex.: filtro de alimentador) não há insight da receita.
  if (p.efeito_preco.valor === null || p.efeito_volume.valor === null) {
    throw erroApi(
      422,
      'DECOMPOSICAO_INDISPONIVEL',
      'A Gold não tem decomposição de preço e volume para este recorte.',
    )
  }
  const nome = (
    n: string,
    rotulo: string,
    ind: IndicadorNomeado | typeof p.receita_energia_atual,
  ): IndicadorNomeado => ({ nome: n, rotulo, ...ind })
  const numeros = [
    nome('receita_energia_atual', 'Receita de energia atual', p.receita_energia_atual),
    nome('receita_energia_comparacao', 'Receita de energia base', p.receita_energia_comparacao),
    nome('variacao_volume', 'Volume', dashboard.indicadores.energia_faturada.variacao_percentual),
    nome('reajuste', 'Reajuste', p.reajuste_percentual),
    nome('efeito_preco', 'Efeito-preço', p.efeito_preco),
    nome('efeito_volume', 'Efeito-volume', p.efeito_volume),
  ]
  conferir(corpo.indicadores, numeros)
  const v = Object.fromEntries(numeros.map((n) => [n.nome, n.valor ?? 0]))
  const regional = (['municipio', 'bairro', 'classe', 'alimentador'] as const)
    .map((c) => texto(filtros, c))
    .filter(Boolean)
  let textoInsight =
    `${regional.length ? `Em ${regional.join(' / ')}` : 'No consolidado'}, a receita de energia passou de ${brl(v.receita_energia_comparacao)} para ${brl(v.receita_energia_atual)}. ` +
    `O reajuste de ${pct(v.reajuste, false)} gerou um efeito-preço de ${brl(v.efeito_preco)}, ` +
    `enquanto o volume faturado variou ${pct(v.variacao_volume)} e respondeu por um efeito-volume de ${brl(v.efeito_volume)}.`
  if (v.efeito_preco > 0 && v.efeito_volume < 0)
    textoInsight += ' O crescimento da receita veio do preço, não de mais consumo.'
  const base = await fixtures.respostaInsight()
  return {
    ...base,
    texto: textoInsight,
    numeros_utilizados: numeros,
    gerado_em: agoraIso(),
    metadados: dashboard.metadados,
  }
}

async function insightUnidade(corpo: Registro): Promise<RespostaInsight> {
  if (corpo.id_uc !== UC_INSIGHT) {
    throw erroApi(
      404,
      'UC_INEXISTENTE',
      `Unidade Consumidora '${String(corpo.id_uc)}' não disponível no cenário.`,
    )
  }
  const { diagnostico_conta: d } = await fixtures.unidade()
  const numeros = NUMEROS_UNIDADE.map(([n, rotulo]): IndicadorNomeado => ({
    nome: n,
    rotulo,
    ...d[n],
  }))
  conferir(corpo.indicadores, numeros)
  return {
    ...(await fixtures.respostaInsightUnidade()),
    numeros_utilizados: numeros,
    gerado_em: agoraIso(),
  }
}

export async function gerarInsightMock(corpo: Registro): Promise<RespostaInsight> {
  if (corpo.contexto !== 'receita' && corpo.contexto !== 'unidade')
    throw invalido("contexto deve ser 'receita' ou 'unidade'.")
  if (typeof corpo.filtros !== 'object' || corpo.filtros === null)
    throw invalido('filtros é obrigatório.')
  const filtros = corpo.filtros as Registro
  const atual = periodo(filtros, 'periodo_atual', true)
  const comparacao = periodo(filtros, 'periodo_comparacao', false)
  compararPeriodos(atual, comparacao)
  regiao(filtros)
  if (corpo.contexto === 'unidade' && (typeof corpo.id_uc !== 'string' || !corpo.id_uc)) {
    throw invalido('Insight de unidade exige id_uc.')
  }
  verificarCenario(atual, comparacao)
  return corpo.contexto === 'receita' ? insightReceita(corpo, filtros) : insightUnidade(corpo)
}
