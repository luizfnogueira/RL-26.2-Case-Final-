/**
 * Larguras das colunas das tabelas da Visão 360, em porcentagem do cartão (com `table-fixed`).
 * Colunas numéricas (alinhadas à direita) ficam estreitas e a sobra vai para as de texto. A largura
 * de cada coluna comporta o cabeçalho, que o `Tabela` não quebra, na largura mínima da tabela.
 */
// Faturas: referência e data mais estreitas e a bandeira mais larga, para o valor (à direita) e
// a bandeira ficarem mais à esquerda.
export const LARGURAS_FATURAS = { referencia: '26%', data: '20%', valor: '16%', bandeira: '38%' }
export const LARGURAS_CONSUMO = { mes: '22%', consumo: '18%', anterior: '26%', leitura: '34%' }
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

/**
 * Recuo à esquerda da 4ª coluna (cabeçalho e células), quando ela vem depois de um número alinhado
 * à direita: o valor não encosta no texto seguinte. Classe literal para o Tailwind encontrá-la.
 */
export const RECUO_QUARTA_COLUNA = '[&_th:nth-child(4)]:pl-8 [&_td:nth-child(4)]:pl-8'
