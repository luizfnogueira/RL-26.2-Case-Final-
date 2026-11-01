import type { Comparacao, ItemComparacao, Kpi } from '@/types/dashboard'

export type CampoComparacao = Exclude<keyof ItemComparacao, 'nome'>

export const INDICADORES_COMPARACAO: readonly {
  campo: CampoComparacao
  titulo: string
  unidade: string
  criterio: string
}[] = [
  {
    campo: 'ucs_ativas',
    titulo: 'UCs ativas',
    unidade: 'UCs',
    criterio: 'Tamanho do recorte; sem classificação de melhor ou pior.',
  },
  {
    campo: 'receita_media_uc',
    titulo: 'Receita por UC',
    unidade: 'R$/UC/mês',
    criterio: 'Pior: menor valor atual por UC.',
  },
  {
    campo: 'consumo_medio_uc',
    titulo: 'Consumo por UC',
    unidade: 'kWh/UC/mês',
    criterio: 'Pior: maior queda percentual em relação à comparação.',
  },
  {
    campo: 'valor_em_aberto_pct',
    titulo: 'Valor em aberto',
    unidade: '% da receita',
    criterio: 'Pior: maior percentual atual em aberto.',
  },
  {
    campo: 'dec',
    titulo: 'DEC',
    unidade: 'h/UC',
    criterio: 'Pior: maior duração atual das interrupções por UC.',
  },
  {
    campo: 'fec',
    titulo: 'FEC',
    unidade: 'interrupções/UC',
    criterio: 'Pior: maior frequência atual das interrupções por UC.',
  },
]

/** Critérios da proposta de C3. Seleciona destaques; não recalcula nenhum KPI. */
export function pioresDaLinha(itens: readonly ItemComparacao[], campo: CampoComparacao): string[] {
  if (campo === 'ucs_ativas') return []
  const valores = itens.flatMap((item) => {
    const valor =
      campo === 'consumo_medio_uc' ? item[campo].variacao_percentual.valor : item[campo].atual.valor
    // Sem valor atual, o recorte não participa da classificação.
    return valor === null || !Number.isFinite(valor) || item[campo].atual.valor === null
      ? []
      : [{ nome: item.nome, valor }]
  })
  if (valores.length < 2) return []
  const menor = campo === 'receita_media_uc' || campo === 'consumo_medio_uc'
  const pior = menor
    ? Math.min(...valores.map((v) => v.valor))
    : Math.max(...valores.map((v) => v.valor))
  // Crescimento menor não é queda de consumo; não inventar um ofensor nesse cenário.
  if (campo === 'consumo_medio_uc' && pior >= 0) return []
  return valores.filter((v) => v.valor === pior).map((v) => v.nome)
}

export function motivoAusencia(
  item: ItemComparacao,
  campo: CampoComparacao,
  kpi: Kpi,
  lado: 'atual' | 'comparacao' | 'variacao_percentual',
  nivel: Comparacao['filtros']['nivel'],
): string {
  if ((campo === 'dec' || campo === 'fec') && nivel !== 'municipio')
    return 'DEC e FEC não são disponibilizados por bairro ou classe; a continuidade é medida por alimentador e município.'
  if (lado === 'variacao_percentual' && kpi.comparacao.valor === 0)
    return 'A base de comparação é zero; a variação percentual não é definida.'
  if (lado !== 'variacao_percentual' && item.ucs_ativas[lado].valor === 0)
    return 'Nenhuma UC ativa neste recorte no período; a fonte não disponibiliza este indicador.'
  return lado === 'variacao_percentual'
    ? 'A fonte não informou um dos valores necessários à variação.'
    : 'A fonte não informou este indicador para o recorte e o período.'
}
