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
const ROTULO_RECORTE =
  'Distribuição ilustrativa do consolidado; não representa metodologia nem diagnóstico real.'
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

/** Efeito-preço proporcional à receita atual; efeito-volume, à variação de energia. */
function efeitos(soma: Soma, total: Soma, ponte: PonteReceita): [number, number] {
  const preco = arredondar(
    ((ponte.efeito_preco.valor ?? 0) * soma.receita_atual) / total.receita_atual,
  )
  const volume = arredondar(
    ((ponte.efeito_volume.valor ?? 0) * (soma.energia_atual - soma.energia_comparacao)) /
      (total.energia_atual - total.energia_comparacao),
  )
  return [preco, volume]
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
      ...kpi('Inadimplência', soma.inadimplencia_atual, soma.inadimplencia_comparacao, 'BRL'),
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

function ponteReceita(soma: Soma, total: Soma, ponte: PonteReceita): PonteReceita {
  const [preco, volume] = efeitos(soma, total, ponte)
  const atual = soma.receita_atual
  const comparacao = soma.receita_comparacao
  return {
    receita_comparacao: indicador(comparacao, 'BRL', PC),
    efeito_preco: indicador(preco, 'BRL', PA),
    efeito_volume: indicador(volume, 'BRL', PA),
    // Resíduo: garante receita_comparacao + efeitos = receita_atual em qualquer recorte.
    bandeira_mix: indicador(arredondar(atual - comparacao - preco - volume), 'BRL', PA),
    receita_atual: indicador(atual, 'BRL', PA),
    reajuste_percentual: ponte.reajuste_percentual,
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

function drill(p: ParamsNormalizados, recortes: Recorte[], total: Soma, ponte: PonteReceita) {
  const grupos = new Map<string, Recorte[]>()
  for (const recorte of recortes) {
    const chave = recorte[p.nivel]
    grupos.set(chave, [...(grupos.get(chave) ?? []), recorte])
  }
  const linhas: LinhaDrill[] = [...grupos].map(([nome, grupo]) => {
    const soma = somar(grupo)
    const [preco, volume] = efeitos(soma, total, ponte)
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
      receita_atual: indicador(soma.receita_atual, 'BRL', PA),
      receita_comparacao: indicador(soma.receita_comparacao, 'BRL', PC),
      energia_atual: indicador(soma.energia_atual, 'kWh', PA),
      energia_comparacao: indicador(soma.energia_comparacao, 'kWh', PC),
      variacao_energia_percentual: indicador(
        variacao(soma.energia_atual, soma.energia_comparacao),
        '%',
        PA,
      ),
      queda_kwh: indicador(soma.energia_comparacao - soma.energia_atual, 'kWh', PA),
      efeito_preco: indicador(preco, 'BRL', PA),
      efeito_volume: indicador(volume, 'BRL', PA),
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
    ponte_receita: ponteReceita(soma, total, base.ponte_receita),
    drill_down: drill(p, selecionados, total, base.ponte_receita),
    metadados,
  }
}
