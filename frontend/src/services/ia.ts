import type { PedidoInsight, PerguntaIA, RespostaIA, RespostaInsight } from '@/types/ia'
import { requisitar } from './http'

/**
 * POST /ia: pergunta em português ao agente (somente leitura). As respostas `nao_sei` e
 * `bloqueado` chegam como sucesso (HTTP 200) e devem ser tratadas na interface.
 * `conversaId` é o id devolvido na resposta anterior: com ele o agente lembra a conversa.
 */
export function perguntarIA(
  pergunta: string,
  sinal?: AbortSignal,
  conversaId?: string | null,
): Promise<RespostaIA> {
  const corpo: PerguntaIA = conversaId ? { pergunta, conversa_id: conversaId } : { pergunta }
  return requisitar<RespostaIA>('POST', '/ia', { corpo, sinal })
}

/** POST /ia/insight: análise automática da Tela 2 (receita) e resumo da Tela 3 (unidade). */
export function gerarInsight(pedido: PedidoInsight, sinal?: AbortSignal): Promise<RespostaInsight> {
  return requisitar<RespostaInsight>('POST', '/ia/insight', { corpo: pedido, sinal })
}
