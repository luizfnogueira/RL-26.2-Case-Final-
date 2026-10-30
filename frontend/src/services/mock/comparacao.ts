// Comparação simulada: o mock do /dashboard filtrado por cada item, com as contas de
// backend/app/services/comparacao_service.py (médias por UC por mês e valor em aberto em %).
import type { Comparacao, ItemComparacao, Kpi, NivelDrill } from '@/types/dashboard'
import { duracaoEmMeses } from '@/utils/periodos'
import { ApiError } from '../erro-api'
import { montarDashboard } from './dashboard'
import { arredondar, indicador, verificarCenario, type Registro } from './util'
import { compararPeriodos, invalido, periodo, regiao, texto } from './validacao'

const NIVEIS: readonly NivelDrill[] = ['municipio', 'bairro', 'classe']

function validar(params: Registro) {
  const atual = periodo(params, 'periodo_atual', true) as string
  const comparacao = periodo(params, 'periodo_comparacao', true) as string
  compararPeriodos(atual, comparacao)
  // Antes dos itens: fora das janelas simuladas é erro do pedido, não item vazio.
  verificarCenario(atual, comparacao)
  const nivel = texto(params, 'nivel') as NivelDrill | undefined
  if (!nivel || !NIVEIS.includes(nivel))
    throw invalido('nivel deve ser municipio, bairro ou classe.')
  const bruto = params.itens
  const itens: string[] = []
  if (Array.isArray(bruto)) {
    for (const b of bruto) {
      if (typeof b === 'string' && b.includes(',')) {
        itens.push(...b.split(',').map((s) => s.trim()).filter(Boolean))
      } else if (b !== undefined && b !== null && String(b).trim()) {
        itens.push(String(b).trim())
      }
    }
  } else if (typeof bruto === 'string') {
    itens.push(...bruto.split(',').map((s) => s.trim()).filter(Boolean))
  } else if (bruto) {
    itens.push(String(bruto).trim())
  }
  if (itens.length < 2 || itens.length > 4) throw invalido('Informe de 2 a 4 itens.')
  if (new Set(itens).size !== itens.length) throw invalido('itens repetidos.')
  const { municipio, bairro, classe, alimentador } = regiao(params)
  if (classe || alimentador)
    throw invalido('A comparação aceita só municipio e bairro como filtros pai.')
  if (nivel === 'municipio' && (municipio || bairro))
    throw invalido('nivel municipio não aceita filtro pai.')
  if (nivel === 'bairro' && (!municipio || bairro))
    throw invalido('nivel bairro exige municipio, sem bairro.')
  return { atual, comparacao, nivel, itens, municipio, bairro }
}

function kpi(
  rotulo: string,
  atual: number | null,
  comparacao: number | null,
  unidade: string,
  pa: string,
  pc: string,
): Kpi {
  const ausente = atual === null || comparacao === null
  return {
    rotulo,
    atual: indicador(atual, unidade, pa),
    comparacao: indicador(comparacao, unidade, pc),
    diferenca: indicador(ausente ? null : arredondar(atual - comparacao, 4), unidade, pa),
    variacao_percentual: indicador(
      ausente || comparacao === 0 ? null : arredondar(((atual - comparacao) / comparacao) * 100, 4),
      '%',
      pa,
    ),
  }
}

/** Denominador: UCs ativas no fim da janela. Sem UC, a média não existe (null, nunca 0). */
const porUcMes = (total: number | null, ucs: number | null, meses: number) =>
  total === null || !ucs ? null : arredondar(total / ucs / meses, 2)

function itemVazio(nome: string, pa: string, pc: string): ItemComparacao {
  const vazio = (rotulo: string, unidade: string) => kpi(rotulo, null, null, unidade, pa, pc)
  return {
    nome,
    ucs_ativas: kpi('UCs ativas', 0, 0, 'UCs', pa, pc),
    receita_media_uc: vazio('Receita por UC', 'BRL/UC/mes'),
    consumo_medio_uc: vazio('Consumo por UC', 'kWh/UC/mes'),
    valor_em_aberto_pct: vazio('Valor em aberto (% da receita)', '%'),
    dec: vazio('DEC médio', 'h/UC'),
    fec: vazio('FEC médio', 'interrupcoes/UC'),
  }
}

export async function montarComparacao(params: Registro): Promise<Comparacao> {
  const p = validar(params)
  const meses = duracaoEmMeses(p.atual) as number // período já validado
  const observacoes = ['Dados fictícios: o mock do painel filtrado por item.']
  const itens: ItemComparacao[] = []
  for (const nome of p.itens) {
    let indicadores
    try {
      ;({ indicadores } = await montarDashboard({
        periodo_atual: p.atual,
        periodo_comparacao: p.comparacao,
        municipio: p.municipio,
        bairro: p.bairro,
        [p.nivel]: nome,
      }))
    } catch (erro) {
      // Item fora dos recortes fictícios: vem vazio, sem derrubar os outros (como a API).
      if (!(erro instanceof ApiError) || erro.codigo !== 'CENARIO_STUB_INDISPONIVEL') throw erro
      observacoes.push(`${nome}: nenhuma UC neste recorte; indicadores ausentes.`)
      itens.push(itemVazio(nome, p.atual, p.comparacao))
      continue
    }
    const ucs = indicadores.ucs_ativas
    const media = (total: Kpi, rotulo: string, unidade: string) =>
      kpi(
        rotulo,
        porUcMes(total.atual.valor, ucs.atual.valor, meses),
        porUcMes(total.comparacao.valor, ucs.comparacao.valor, meses),
        unidade,
        p.atual,
        p.comparacao,
      )
    const aberto = indicadores.inadimplencia
    itens.push({
      nome,
      ucs_ativas: ucs,
      receita_media_uc: media(indicadores.receita_faturada, 'Receita por UC', 'BRL/UC/mes'),
      consumo_medio_uc: media(indicadores.energia_faturada, 'Consumo por UC', 'kWh/UC/mes'),
      valor_em_aberto_pct: {
        ...kpi(
          'Valor em aberto (% da receita)',
          aberto.percentual_receita_atual.valor,
          aberto.percentual_receita_comparacao.valor,
          '%',
          p.atual,
          p.comparacao,
        ),
        diferenca: aberto.variacao_pontos_percentuais,
      },
      dec: indicadores.dec_medio,
      fec: indicadores.fec_medio,
    })
  }
  if (p.nivel !== 'municipio') {
    observacoes.push('DEC e FEC só existem por município: ausentes para bairro e classe.')
  }
  return {
    filtros: {
      periodo_atual: p.atual,
      periodo_comparacao: p.comparacao,
      municipio: p.municipio ?? null,
      bairro: p.bairro ?? null,
      classe: null,
      alimentador: null,
      nivel: p.nivel,
      itens: p.itens,
    },
    itens,
    metadados: { dados_ficticios: true, gold_atualizada_em: null, observacoes },
  }
}
