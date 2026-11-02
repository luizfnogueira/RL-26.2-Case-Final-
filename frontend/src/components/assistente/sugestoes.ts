/**
 * Perguntas sugeridas da Tela 7 (GENAI-16), por categoria, incluindo as 3 perguntas do case.
 * Toda sugestão precisa estar no golden set com status ok ou esclarecer (ai-agent/avaliacao/perguntas.yaml):
 * o teste backend/tests/test_sugestoes_golden.py confere quando o golden set existir.
 */
export const SUGESTOES_POR_CATEGORIA = [
  {
    categoria: 'Receita e conta de luz',
    perguntas: [
      'Qual foi a receita no período?',
      'Por que a conta de luz aumentou?',
      'Quanto a receita comercial cresceu em Jaboatão?',
      'Quanto da variação da receita foi preço e quanto foi volume?',
    ],
  },
  {
    categoria: 'Consumo',
    perguntas: [
      'Qual bairro mais perdeu volume residencial no último ano?',
      'Quantas unidades com painel solar em Olinda tiveram queda de consumo acima de 30%?',
      'Qual foi a energia faturada em P2 comparada a P1?',
    ],
  },
  {
    categoria: 'Falta de luz (DEC/FEC)',
    perguntas: [
      'Quais bairros tiveram mais falta de luz em P2?',
      'Quais os 5 alimentadores com maior DEC em P2?',
      'Qual foi o DEC de P2 sem o dia crítico?',
    ],
  },
  {
    categoria: 'Atendimento',
    perguntas: [
      'Qual canal de atendimento tem a pior nota de satisfação?',
      'Quais os assuntos mais frequentes no call center em P2?',
    ],
  },
  {
    categoria: 'Perdas',
    perguntas: [
      'Quais UCs têm maior risco de perda?',
      'Quantas UCs estão na fila de perdas por ação recomendada?',
    ],
  },
  {
    categoria: 'Como usar a plataforma',
    perguntas: ['O que é a aba Assistente V-Energy?', 'Como gero uma ordem de inspeção?'],
  },
]

/** Candidatas a destaque da conversa vazia; o mock do front responde todas. */
export const PERGUNTAS_SUGERIDAS = [
  'Por que a conta de luz aumentou?',
  'Quais bairros tiveram mais falta de luz em P2?',
  'Quais UCs têm maior risco de perda?',
  'Qual foi a receita no período?',
]

/** Quantos destaques a conversa vazia mostra; o resto fica na aba Sugestões. */
export const QTD_DESTAQUES = 2

/**
 * Sorteia os destaques de uma conversa nova, diferentes da dupla anterior
 * (a mesma dupla em outra ordem também conta como repetida).
 */
export function sortearDestaques(
  anteriores: readonly string[] = [],
  aleatorio: () => number = Math.random,
): string[] {
  const embaralhar = () =>
    [...PERGUNTAS_SUGERIDAS]
      .map((pergunta) => ({ pergunta, peso: aleatorio() }))
      .sort((a, b) => a.peso - b.peso)
      .map(({ pergunta }) => pergunta)
      .slice(0, QTD_DESTAQUES)
  const repetida = (dupla: string[]) =>
    anteriores.length === dupla.length && dupla.every((p) => anteriores.includes(p))
  // Poucas tentativas bastam: com 4 perguntas, 5 de 6 duplas servem
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const dupla = embaralhar()
    if (!repetida(dupla)) return dupla
  }
  // Sorteio viciado (só nos testes): troca uma das perguntas da dupla anterior
  const fora = PERGUNTAS_SUGERIDAS.find((p) => !anteriores.includes(p))
  return fora ? [anteriores[0], fora] : embaralhar()
}
