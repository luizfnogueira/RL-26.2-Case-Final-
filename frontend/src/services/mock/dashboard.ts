// Dashboard simulado. Porta de backend/app/services/stub_dashboard.py: os recortes fictícios
// distribuem o consolidado. Não é a implementação real (B3b), que lê a Gold.
import type {
  Dashboard,
  IndicadoresDashboard,
  Kpi,
  LinhaDrill,
  NivelDrill,
  ParamsDashboard,
  PonteReceita,
  PontoSerie,
} from '@/types/dashboard'
import { fixtures, type Recorte } from './fixtures'
import {
  CAMPOS_REGIAO,
  PERIODO_ATUAL as PA,
  PERIODO_COMPARACAO as PC,
  arredondar,
  erroApi,
  filtrarRegiao,
  indicador,
  paginar,
  verificarCenario,
  type Registro,
} from './util'
import { compararPeriodos, invalido, paginacao, periodo, regiao, texto } from './validacao'

type Campo =
  | 'receita_atual'
  | 'receita_comparacao'
  | 'energia_atual'
  | 'energia_comparacao'
  | 'ucs_ativas_atual'
  | 'ucs_ativas_comparacao'
  | 'inadimplencia_atual'
  | 'inadimplencia_comparacao'
type Soma = Record<Campo, number>

const CAMPOS: Campo[] = [
  'receita_atual',
  'receita_comparacao',
  'energia_atual',
  'energia_comparacao',
  'ucs_ativas_atual',
  'ucs_ativas_comparacao',
  'inadimplencia_atual',
  'inadimplencia_comparacao',
]
// Parcela de energia da receita no stub (tributos fictícios de 28%); a Gold traz receita_energia pronta.
const FATOR_ENERGIA = 1 / 1.28
const ROTULO_RECORTE =
  'Distribuição ilustrativa do consolidado; não representa metodologia nem diagnóstico real.'
const SEM_DECOMPOSICAO_ALIMENTADOR =
  'Ponte de receita e drill-down não existem por alimentador; a decomposição da Gold é por município, bairro e classe.'
const SEM_DEC_FEC =
  'DEC/FEC por recorte não estão disponíveis no dashboard simulado; consulte GET /operacao.'

function somar(recortes: Recorte[]): Soma {
  const soma = {} as Soma
  for (const campo of CAMPOS) soma[campo] = recortes.reduce((total, r) => total + r[campo], 0)
  return soma
}

function variacao(atual: number, comparacao: number): number | null {
  return comparacao ? arredondar(((atual - comparacao) / comparacao) * 100, 4) : null
}

function kpi(rotulo: string, atual: number, comparacao: number, unidade: string): Kpi {
  return {
    rotulo,
    atual: indicador(atual, unidade, PA),
    comparacao: indicador(comparacao, unidade, PC),
    diferenca: indicador(arredondar(atual - comparacao), unidade, PA),
    variacao_percentual: indicador(variacao(atual, comparacao), '%', PA),
  }
}

interface Decomposicao {
  atual: number
  comparacao: number
  volume: number
  preco: number
}

/**
 * Preço × volume como em gold.agg_preco_volume: por recorte, depois somado.
 * efeito_volume = (kWh atual − kWh comparação) × tarifa de comparação;
 * efeito_preco = variação da receita de energia − efeito_volume (fecha sem resíduo).
 */
function decompor(recortes: Recorte[]): Decomposicao {
  let atual = 0
  let comparacao = 0
  let volume = 0
  for (const r of recortes) {
    const receitaAtual = r.receita_atual * FATOR_ENERGIA
    const receitaComparacao = r.receita_comparacao * FATOR_ENERGIA
    // Regra 4.8 do contrato Gold: segmento sem kWh na comparação (sem tarifa-base) leva toda a
    // variação para o volume.
    volume +=
      r.energia_comparacao > 0
        ? ((r.energia_atual - r.energia_comparacao) * receitaComparacao) / r.energia_comparacao
        : receitaAtual - receitaComparacao
    atual += receitaAtual
    comparacao += receitaComparacao
  }
  atual = arredondar(atual)
  comparacao = arredondar(comparacao)
  volume = arredondar(volume)
  return { atual, comparacao, volume, preco: arredondar(atual - comparacao - volume) }
}

function indicadores(
  soma: Soma,
  base: IndicadoresDashboard,
  filtrado: boolean,
): IndicadoresDashboard {
  const pctAtual = arredondar((soma.inadimplencia_atual / soma.receita_atual) * 100, 4)
  const pctComparacao = arredondar(
    (soma.inadimplencia_comparacao / soma.receita_comparacao) * 100,
    4,
  )
  const continuidade = { dec_medio: base.dec_medio, fec_medio: base.fec_medio }
  if (filtrado) {
    for (const k of [continuidade.dec_medio, continuidade.fec_medio]) {
      k.atual.valor = k.comparacao.valor = k.diferenca.valor = k.variacao_percentual.valor = null
    }
  }
  return {
    receita_faturada: kpi('Receita faturada', soma.receita_atual, soma.receita_comparacao, 'BRL'),
    energia_faturada: kpi('Volume faturado', soma.energia_atual, soma.energia_comparacao, 'kWh'),
    ucs_ativas: kpi('UCs ativas', soma.ucs_ativas_atual, soma.ucs_ativas_comparacao, 'UCs'),
    inadimplencia: {
      ...kpi('Valor em aberto', soma.inadimplencia_atual, soma.inadimplencia_comparacao, 'BRL'),
      percentual_receita_atual: indicador(pctAtual, '%', PA),
      percentual_receita_comparacao: indicador(pctComparacao, '%', PC),
      variacao_pontos_percentuais: indicador(arredondar(pctAtual - pctComparacao, 4), 'p.p.', PA),
    },
    ...continuidade,
  }
}

function serie(pontos: PontoSerie[], soma: Soma, total: Soma): PontoSerie[] {
  // Fatores por ano: 1º ano = participação na comparação, 4º = participação atual.
  pontos.forEach((ponto, i) => {
    const ano = Math.floor(i / 12)
    for (const nome of ['receita', 'energia'] as const) {
      const inicio = soma[`${nome}_comparacao`] / total[`${nome}_comparacao`]
      const fim = soma[`${nome}_atual`] / total[`${nome}_atual`]
      ponto[nome].valor = arredondar(
        (ponto[nome].valor ?? 0) * (inicio + ((fim - inicio) * ano) / 3),
      )
    }
  })
  return pontos
}

function ponteReceita(recortes: Recorte[]): PonteReceita {
  const d = decompor(recortes)
  const soma = somar(recortes)
  const tarifaAtual = d.atual / soma.energia_atual
  const tarifaComparacao = d.comparacao / soma.energia_comparacao
  return {
    receita_energia_comparacao: indicador(d.comparacao, 'BRL', PC),
    efeito_preco: indicador(d.preco, 'BRL', PA),
    efeito_volume: indicador(d.volume, 'BRL', PA),
    receita_energia_atual: indicador(d.atual, 'BRL', PA),
    reajuste_percentual: indicador(variacao(tarifaAtual, tarifaComparacao), '%', PA),
  }
}

function ponteNula(): PonteReceita {
  return {
    receita_energia_comparacao: indicador(null, 'BRL', PC),
    efeito_preco: indicador(null, 'BRL', PA),
    efeito_volume: indicador(null, 'BRL', PA),
    receita_energia_atual: indicador(null, 'BRL', PA),
    reajuste_percentual: indicador(null, '%', PA),
  }
}

interface ParamsNormalizados {
  periodo_atual: string
  periodo_comparacao: string
  nivel: NivelDrill
  page: number
  pageSize: number
  municipio?: string
  bairro?: string
  classe?: string
  alimentador?: string
}

function validar(params: Registro): ParamsNormalizados {
  const atual = periodo(params, 'periodo_atual', true) as string
  const comparacao = periodo(params, 'periodo_comparacao', true) as string
  compararPeriodos(atual, comparacao)
  const nivel = (texto(params, 'nivel') ?? 'municipio') as NivelDrill
  if (!['municipio', 'bairro', 'classe'].includes(nivel)) throw invalido('nivel inválido.')
  const filtros = regiao(params)
  if (nivel === 'bairro' && !filtros.municipio) throw invalido('nivel bairro exige municipio.')
  if (nivel === 'classe' && !(filtros.municipio && filtros.bairro)) {
    throw invalido('nivel classe exige municipio e bairro.')
  }
  const { page, pageSize } = paginacao(params)
  return { periodo_atual: atual, periodo_comparacao: comparacao, nivel, page, pageSize, ...filtros }
}

function drill(p: ParamsNormalizados, recortes: Recorte[]) {
  const grupos = new Map<string, Recorte[]>()
  for (const recorte of recortes) {
    const chave = recorte[p.nivel]
    grupos.set(chave, [...(grupos.get(chave) ?? []), recorte])
  }
  const linhas: LinhaDrill[] = [...grupos].map(([nome, grupo]) => {
    const soma = somar(grupo)
    const d = decompor(grupo)
    // Filtros para reenviar com o próximo nível: os atuais mais o valor desta linha.
    const filtros = {
      municipio: p.municipio ?? null,
      bairro: p.bairro ?? null,
      classe: p.classe ?? null,
      [p.nivel]: nome,
    }
    return {
      nivel: p.nivel,
      nome,
      receita_energia_atual: indicador(d.atual, 'BRL', PA),
      receita_energia_comparacao: indicador(d.comparacao, 'BRL', PC),
      energia_atual: indicador(soma.energia_atual, 'kWh', PA),
      energia_comparacao: indicador(soma.energia_comparacao, 'kWh', PC),
      variacao_energia_percentual: indicador(
        variacao(soma.energia_atual, soma.energia_comparacao),
        '%',
        PA,
      ),
      queda_kwh: indicador(soma.energia_comparacao - soma.energia_atual, 'kWh', PA),
      efeito_preco: indicador(d.preco, 'BRL', PA),
      efeito_volume: indicador(d.volume, 'BRL', PA),
      filtros,
    }
  })
  linhas.sort(
    (a, b) =>
      (b.queda_kwh.valor ?? 0) - (a.queda_kwh.valor ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'),
  )

  const vazio = { municipio: null, bairro: null, classe: null }
  const breadcrumb: Dashboard['drill_down']['breadcrumb'] = [
    { nivel: 'consolidado', rotulo: 'Todos os municípios', filtros: vazio },
  ]
  if (p.nivel === 'bairro' || p.nivel === 'classe') {
    breadcrumb.push({
      nivel: 'municipio',
      rotulo: p.municipio as string,
      filtros: { ...vazio, municipio: p.municipio ?? null },
    })
  }
  if (p.nivel === 'classe') {
    breadcrumb.push({
      nivel: 'bairro',
      rotulo: p.bairro as string,
      filtros: { ...vazio, municipio: p.municipio ?? null, bairro: p.bairro ?? null },
    })
  }
  return { nivel: p.nivel, breadcrumb, ...paginar(linhas, p.page, p.pageSize) }
}

/** GET /dashboard simulado. Aceita ParamsDashboard (ou um objeto equivalente). */
export async function montarDashboard(parametros: ParamsDashboard | Registro): Promise<Dashboard> {
  const p = validar(parametros as Registro)
  verificarCenario(p.periodo_atual, p.periodo_comparacao)
  const base = await fixtures.dashboard()
  const { recortes } = await fixtures.recortes()
  const selecionados = filtrarRegiao(recortes, p)
  if (selecionados.length === 0) {
    throw erroApi(
      422,
      'CENARIO_STUB_INDISPONIVEL',
      'Nenhum recorte fictício corresponde aos filtros informados.',
    )
  }
  const total = somar(recortes)
  const soma = somar(selecionados)
  const filtrado = selecionados.length < recortes.length
  const metadados = base.metadados
  if (filtrado) metadados.observacoes.push(ROTULO_RECORTE, SEM_DEC_FEC)
  // Como a API real: a decomposição da Gold é por município, bairro e classe. Com filtro de
  // alimentador a ponte vem com valores null, o drill-down vazio e o motivo na última observação.
  const semDecomposicao = p.alimentador !== undefined
  if (semDecomposicao) metadados.observacoes.push(SEM_DECOMPOSICAO_ALIMENTADOR)

  return {
    filtros: {
      periodo_atual: p.periodo_atual,
      periodo_comparacao: p.periodo_comparacao,
      ...(Object.fromEntries(CAMPOS_REGIAO.map((c) => [c, p[c] ?? null])) as Record<
        (typeof CAMPOS_REGIAO)[number],
        string | null
      >),
    },
    indicadores: indicadores(soma, base.indicadores, filtrado),
    serie_historica: filtrado ? serie(base.serie_historica, soma, total) : base.serie_historica,
    ponte_receita: semDecomposicao ? ponteNula() : ponteReceita(selecionados),
    drill_down: drill(p, semDecomposicao ? [] : selecionados),
    metadados,
  }
}
