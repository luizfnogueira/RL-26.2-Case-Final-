import { createContext, useContext } from 'react'
import type { ApiError } from '@/services/erro-api'
import type { RespostaIA } from '@/types/ia'

/** Uma fala da conversa. A resposta do assistente passa por carregando → resposta ou erro. */
export type Mensagem =
  | { id: string; autor: 'usuario'; texto: string }
  | { id: string; autor: 'assistente'; estado: 'carregando'; pergunta: string }
  | { id: string; autor: 'assistente'; estado: 'resposta'; pergunta: string; resposta: RespostaIA }
  | { id: string; autor: 'assistente'; estado: 'erro'; pergunta: string; erro: ApiError }

export interface Assistente {
  mensagens: Mensagem[]
  /** true enquanto uma pergunta espera resposta; bloqueia o envio de outra. */
  enviando: boolean
  perguntar: (texto: string) => void
  /** Reenvia a pergunta de uma resposta que falhou. */
  tentarNovamente: (idResposta: string) => void
  limpar: () => void
  painelAberto: boolean
  abrirPainel: () => void
  fecharPainel: () => void
}

export const ContextoAssistente = createContext<Assistente | null>(null)

/** Liga o botão flutuante ao painel que ele abre (aria-controls). */
export const ID_PAINEL_ASSISTENTE = 'painel-assistente'

/** Conversa e painel do Assistente, compartilhados entre o painel flutuante e a tela /assistente. */
export function useAssistente(): Assistente {
  const assistente = useContext(ContextoAssistente)
  if (!assistente) throw new Error('useAssistente precisa estar dentro de <AssistenteProvider>.')
  return assistente
}
