// DEC/FEC simulados. Porta de backend/app/services/stub_operacao.py: rankings recalculados
// sobre os alimentadores filtrados.
import type {
  Operacao,
  OrdenarPor,
  ParamsOperacao,
  RankingAlimentador,
  RankingRegional,
} from '@/types/operacao'
import { fixtures } from './fixtures'
import {
  PERIODO_ATUAL,
  arredondar,
  erroApi,
  indicador,
  paginar,
  verificarCenario,
  type Registro,
} from './util'
import { invalido, paginacao, periodo, regiao, texto } from './validacao'

type Medias = 'dec' | 'fec' | 'dec_sem_dia_critico' | 'fec_sem_dia_critico'
type Totais = 'interrupcoes' | 'horas_interrupcao'

const UNIDADES: Record<Medias | Totais, string> = {
  dec: 'h/UC',
  fec: 'interrupcoes/UC',
  dec_sem_dia_critico: 'h/UC',
  fec_sem_dia_critico: 'interrupcoes/UC',
  interrupcoes: 'interrupcoes',
  horas_interrupcao: 'h',
}
const CAMPO_ORDENACAO = { dec: 'dec', fec: 'fec', chi: 'horas_interrupcao' } as const
const mesmoNome = (a: string, b: string) =>
  a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR')

function ordenar<T extends { posicao: number } & Record<Medias | Totais, { valor: number | null }>>(
  items: T[],
  por: OrdenarPor,
  nome: (item: T) => string,
): T[] {
  const campo = CAMPO_ORDENACAO[por]
  items.sort(
    (a, b) =>
      (b[campo].valor ?? 0) - (a[campo].valor ?? 0) || nome(a).localeCompare(nome(b), 'pt-BR'),
  )
  items.forEach((item, i) => (item.posicao = i + 1))
  return items
}

/** Média de DEC/FEC ponderada pelas UCs de cada alimentador; o denominador não é recalculado por bairro. */
function regional(
  alimentadores: RankingAlimentador[],
  nivel: 'municipio' | 'bairro',
  bairroFiltro?: string,
): RankingRegional[] {
  const grupos = new Map<
    string,
    { municipio: string; bairro: string | null; itens: RankingAlimentador[] }
  >()
  const adicionar = (municipio: string, bairro: string | null, item: RankingAlimentador) => {
    const chave = `${municipio}\u0000${bairro ?? ''}`
    const grupo = grupos.get(chave) ?? { municipio, bairro, itens: [] }
    grupo.itens.push(item)
    grupos.set(chave, grupo)
  }
  for (const a of alimentadores) {
    if (nivel === 'municipio') adicionar(a.municipio, null, a)
    else
      for (const bairro of a.bairros_atendidos)
        if (!bairroFiltro || mesmoNome(bairroFiltro, bairro)) adicionar(a.municipio, bairro, a)
  }
  return [...grupos.values()].map(({ municipio, bairro, itens }) => {
    const ucs = itens.reduce((s, a) => s + a.ucs_atendidas, 0)
    const media = (campo: Medias) =>
      indicador(
        arredondar(itens.reduce((s, a) => s + (a[campo].valor ?? 0) * a.ucs_atendidas, 0) / ucs),
        UNIDADES[campo],
        PERIODO_ATUAL,
      )
    const total = (campo: Totais) =>
      indicador(
        arredondar(itens.reduce((s, a) => s + (a[campo].valor ?? 0), 0)),
        UNIDADES[campo],
        PERIODO_ATUAL,
      )
    return {
      posicao: 0,
      municipio,
      bairro,
      dec: media('dec'),
      fec: media('fec'),
      dec_sem_dia_critico: media('dec_sem_dia_critico'),
      fec_sem_dia_critico: media('fec_sem_dia_critico'),
      interrupcoes: total('interrupcoes'),
      horas_interrupcao: total('horas_interrupcao'),
    }
  })
}

export async function montarOperacao(parametros: ParamsOperacao | Registro): Promise<Operacao> {
  const params = parametros as Registro
  const atual = periodo(params, 'periodo_atual', true) as string
  const ordenarPor = (texto(params, 'ordenar_por') ?? 'dec') as OrdenarPor
  if (!['dec', 'fec', 'chi'].includes(ordenarPor)) {
    throw invalido('ordenar_por deve ser dec, fec ou chi.')
  }
  const nivel = (texto(params, 'nivel_regional') ?? 'municipio') as 'municipio' | 'bairro'
  if (!['municipio', 'bairro'].includes(nivel))
    throw invalido('nivel_regional deve ser municipio ou bairro.')
  const filtros = regiao(params)
  const { page, pageSize } = paginacao(params)

  verificarCenario(atual)
  if (filtros.classe !== undefined) {
    throw erroApi(
      422,
      'CENARIO_STUB_INDISPONIVEL',
      'O filtro classe não está disponível no mock operacional.',
    )
  }
  const base = await fixtures.operacao()
  const alimentadores = base.ranking_alimentadores.items.filter(
    (a) =>
      (!filtros.alimentador || filtros.alimentador === a.alimentador) &&
      (!filtros.municipio || mesmoNome(filtros.municipio, a.municipio)) &&
      (!filtros.bairro || a.bairros_atendidos.some((b) => mesmoNome(filtros.bairro!, b))),
  )
  if (alimentadores.length === 0) {
    throw erroApi(
      422,
      'CENARIO_STUB_INDISPONIVEL',
      'Nenhum alimentador fictício corresponde aos filtros informados.',
    )
  }
  const nomes = new Set(alimentadores.map((a) => a.alimentador))
  const ranking = ordenar(
    regional(alimentadores, nivel, filtros.bairro),
    ordenarPor,
    (l) => `${l.municipio} ${l.bairro ?? ''}`,
  )

  return {
    filtros: {
      periodo_atual: atual,
      municipio: filtros.municipio ?? null,
      bairro: filtros.bairro ?? null,
      classe: null,
      alimentador: filtros.alimentador ?? null,
      ordenar_por: ordenarPor,
    },
    serie_historica: base.serie_historica.filter((s) => nomes.has(s.alimentador)),
    ranking_alimentadores: paginar(
      ordenar(alimentadores, ordenarPor, (a) => a.alimentador),
      page,
      pageSize,
    ),
    ranking_regional: { nivel_regional: nivel, ...paginar(ranking, page, pageSize) },
    metadados: base.metadados,
  }
}
