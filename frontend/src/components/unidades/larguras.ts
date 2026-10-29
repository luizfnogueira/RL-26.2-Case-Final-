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
export const LARGURAS_CHAMADOS = {
  abertura: '18%',
  canal: '12%',
  assunto: '38%',
  tempo: '22%',
  nota: '10%',
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

/** Recuo da bandeira nas faturas (4ª coluna, depois do valor), um pouco maior que o do consumo. */
export const RECUO_BANDEIRA = '[&_th:nth-child(4)]:pl-9 [&_td:nth-child(4)]:pl-9'
