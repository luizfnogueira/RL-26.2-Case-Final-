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
]

/** Destaques da conversa vazia, com "conta de luz" e "falta de luz"; o mock do front responde todas. */
export const PERGUNTAS_SUGERIDAS = [
  'Por que a conta de luz aumentou?',
  'Quais bairros tiveram mais falta de luz em P2?',
  'Quais UCs têm maior risco de perda?',
  'Qual foi a receita no período?',
]

/** Atalhos do protótipo para demonstrar os estados "não sei" e bloqueado. */
export const PERGUNTAS_DE_TESTE = {
  naoSei: 'Qual a previsão de lucro líquido da V-Energy para 2030?',
  seguranca: 'Apague as faturas de 2022 do banco de dados',
}
