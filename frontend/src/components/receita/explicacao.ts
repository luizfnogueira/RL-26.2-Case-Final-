import type { EtapaCascata } from '@/components/graficos/geometria'
import type { Dashboard } from '@/types/dashboard'
import type { IndicadorNomeado } from '@/types/comum'
import { formatarEnergia, formatarPercentual, formatarReais } from '@/utils/formatacao'

export interface PontoDeExplicacao {
  id: string
  titulo: string
  texto: string
  tom: 'positivo' | 'negativo' | 'neutro'
}

const tomDe = (valor: number): PontoDeExplicacao['tom'] =>
  valor > 0 ? 'positivo' : valor < 0 ? 'negativo' : 'neutro'

/**
 * "O que explica o resultado?": três frases montadas só com números que a API já entregou
 * (ponte da receita e KPI de energia). Nada é estimado aqui. Sem decomposição, não há explicação.
 */
export function explicarResultado(dashboard: Dashboard): PontoDeExplicacao[] {
  const { ponte_receita: ponte, indicadores } = dashboard
  const preco = ponte.efeito_preco.valor
  const volume = ponte.efeito_volume.valor
  const base = ponte.receita_energia_comparacao.valor
  const atual = ponte.receita_energia_atual.valor
  if (preco === null || volume === null || base === null || atual === null) return []

  const reajuste = ponte.reajuste_percentual.valor
  const energia = indicadores.energia_faturada
  const diferencaKwh = energia.diferenca.valor
  const variacaoEnergia = energia.variacao_percentual.valor

  const pontos: PontoDeExplicacao[] = []

  if (Math.abs(preco) >= Math.abs(volume)) {
    pontos.push({
      id: 'motor',
      titulo: preco >= 0 ? 'Preço foi o principal motor' : 'Preço foi o principal freio',
      texto:
        (reajuste !== null
          ? `O reajuste tarifário médio de ${formatarPercentual(reajuste)} teve impacto de `
          : 'O efeito do preço foi de ') + `${formatarReais(preco, { sinal: true })}.`,
      tom: tomDe(preco),
    })
  } else {
    pontos.push({
      id: 'motor',
      titulo: volume >= 0 ? 'Volume foi o principal motor' : 'Volume foi o principal freio',
      texto: `A variação do consumo teve impacto de ${formatarReais(volume, { sinal: true })}.`,
      tom: tomDe(volume),
    })
  }

  const consumo =
    diferencaKwh !== null && variacaoEnergia !== null
      ? `O consumo ${diferencaKwh < 0 ? 'caiu' : 'subiu'} ${formatarEnergia(Math.abs(diferencaKwh))} (${formatarPercentual(variacaoEnergia, { sinal: true })}), com efeito de `
      : 'O efeito do volume foi de '
  pontos.push({
    id: 'volume',
    titulo:
      volume < 0
        ? 'Volume pressionou o resultado'
        : volume > 0
          ? 'Volume ajudou o resultado'
          : 'Volume não alterou o resultado',
    texto: `${consumo}${formatarReais(volume, { sinal: true })}.`,
    tom: tomDe(volume),
  })

  const variacao = base !== 0 ? ((atual - base) / base) * 100 : null
  pontos.push({
    id: 'resultado',
    titulo: atual >= base ? 'A receita de energia cresceu' : 'A receita de energia encolheu',
    texto:
      `De ${formatarReais(base)} para ${formatarReais(atual)}` +
      (variacao !== null ? ` (${formatarPercentual(variacao, { sinal: true })}).` : '.') +
      (preco > 0 && volume < 0 ? ' O crescimento veio do preço, não de mais consumo.' : ''),
    tom: tomDe(atual - base),
  })

  return pontos
}

/**
 * Os seis números que a tela envia ao /ia/insight. Mesmos nomes e fontes do contrato; a API os
 * confere contra a Gold. Devolve null se algum faltar (ponte indisponível para o recorte).
 */
export function numerosDoInsight(dashboard: Dashboard): IndicadorNomeado[] | null {
  const { ponte_receita: p, indicadores } = dashboard
  const itens: Array<
    [string, string, { valor: number | null; unidade: string; periodo_referencia: string }]
  > = [
    ['receita_energia_atual', 'Receita de energia atual', p.receita_energia_atual],
    ['receita_energia_comparacao', 'Receita de energia base', p.receita_energia_comparacao],
    ['variacao_volume', 'Volume', indicadores.energia_faturada.variacao_percentual],
    ['reajuste', 'Reajuste', p.reajuste_percentual],
    ['efeito_preco', 'Efeito-preço', p.efeito_preco],
    ['efeito_volume', 'Efeito-volume', p.efeito_volume],
  ]
  if (itens.some(([, , indicador]) => indicador.valor === null)) return null
  return itens.map(([nome, rotulo, indicador]) => ({ nome, rotulo, ...indicador }))
}

/** Quatro etapas da ponte, ou null quando a Gold não decompõe este recorte. */
export function etapasDaPonte(dashboard: Dashboard): EtapaCascata[] | null {
  const p = dashboard.ponte_receita
  const valores = [
    p.receita_energia_comparacao.valor,
    p.efeito_preco.valor,
    p.efeito_volume.valor,
    p.receita_energia_atual.valor,
  ]
  if (valores.some((v) => v === null)) return null
  const [base, preco, volume, atual] = valores as number[]
  return [
    { id: 'base', rotulo: 'Receita de energia base', valor: base, tipo: 'total' },
    { id: 'preco', rotulo: 'Efeito-preço', valor: preco, tipo: 'variacao' },
    { id: 'volume', rotulo: 'Efeito-volume', valor: volume, tipo: 'variacao' },
    { id: 'atual', rotulo: 'Receita de energia atual', valor: atual, tipo: 'total' },
  ]
}

/** Variação percentual da receita de energia entre os períodos, ou null sem decomposição. */
export function variacaoDaReceita(dashboard: Dashboard): number | null {
  const base = dashboard.ponte_receita.receita_energia_comparacao.valor
  const atual = dashboard.ponte_receita.receita_energia_atual.valor
  return base === null || atual === null || base === 0 ? null : ((atual - base) / base) * 100
}
