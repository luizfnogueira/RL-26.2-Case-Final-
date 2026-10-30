/**
 * Larguras das colunas das tabelas da Visão 360, em porcentagem do cartão (com `table-fixed`).
 * Colunas numéricas ficam estreitas (à direita, ou centralizadas no consumo e nos chamados) e a
 * sobra vai para as de texto. A largura de cada coluna comporta o cabeçalho, que o `Tabela` não
 * quebra, na largura mínima da tabela.
 */
// Faturas: referência e data mais estreitas e a bandeira mais larga, para o valor (à direita) e
// a bandeira ficarem mais à esquerda.
export const LARGURAS_FATURAS = { referencia: '26%', data: '20%', valor: '16%', bandeira: '38%' }
// Consumo: as três colunas centralizadas com a mesma largura, para os centros ficarem igualmente
// espaçados; 27% comporta "Mesmo mês do ano anterior" (~197 px com o padding) na largura mínima.
export const LARGURAS_CONSUMO = { mes: '19%', consumo: '27%', anterior: '27%', leitura: '27%' }
export const LARGURAS_INTERRUPCOES = {
  inicio: '20%',
  duracao: '14%',
  tipo: '20%',
  causa: '28%',
  alimentador: '18%',
}
// Chamados: o assunto fica no mínimo em que o mais longo da Gold ("Falta de energia · Interrupção
// parcial", ~230 px em Outfit 14px) cabe sem quebrar na largura mínima da tabela (32% de 832 px,
// menos o padding = 242 px). A sobra vai para o tempo e a nota, centralizados.
export const LARGURAS_CHAMADOS = {
  abertura: '18%',
  canal: '12%',
  assunto: '32%',
  tempo: '26%',
  nota: '12%',
}

/**
 * Classe do `Tabela` (vai para o contêiner): tabela na largura do cartão com `table-fixed`, para as
 * porcentagens serem respeitadas em vez de redistribuídas pelo conteúdo. A largura mínima mantém os
 * cabeçalhos dentro das colunas; abaixo dela, a tabela rola na horizontal.
 */
export const TABELA_PROPORCIONAL = '[&_table]:table-fixed [&_table]:min-w-[52rem]'
