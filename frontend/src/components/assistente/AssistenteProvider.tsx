import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { foiCancelada, normalizarErro } from '@/services/erro-api'
import { perguntarIA } from '@/services/ia'
import { ContextoAssistente, type Assistente, type Mensagem } from './contexto'

let sequencia = 0
const novoId = () => `msg-${++sequencia}`

/**
 * Guarda a conversa no layout do portal: trocar de tela não apaga o histórico, e o painel
 * flutuante e a tela /assistente mostram a mesma conversa.
 */
export default function AssistenteProvider({ children }: { children: ReactNode }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [enviando, setEnviando] = useState(false)
  const [painelAberto, setPainelAberto] = useState(false)
  const emAndamento = useRef<AbortController | null>(null)

  useEffect(() => () => emAndamento.current?.abort(), [])

  const responder = useCallback(async (id: string, pergunta: string) => {
    const controlador = new AbortController()
    emAndamento.current = controlador
    setEnviando(true)
    const trocar = (nova: Mensagem) =>
      setMensagens((atuais) => atuais.map((m) => (m.id === id ? nova : m)))
    try {
      const resposta = await perguntarIA(pergunta, controlador.signal)
      trocar({ id, autor: 'assistente', estado: 'resposta', pergunta, resposta })
    } catch (erro) {
      if (foiCancelada(erro)) return
      trocar({ id, autor: 'assistente', estado: 'erro', pergunta, erro: normalizarErro(erro) })
    } finally {
      if (emAndamento.current === controlador) {
        emAndamento.current = null
        setEnviando(false)
      }
    }
  }, [])

  const perguntar = useCallback(
    (texto: string) => {
      const pergunta = texto.trim()
      if (!pergunta || emAndamento.current) return
      const idResposta = novoId()
      setMensagens((atuais) => [
        ...atuais,
        { id: novoId(), autor: 'usuario', texto: pergunta },
        { id: idResposta, autor: 'assistente', estado: 'carregando', pergunta },
      ])
      void responder(idResposta, pergunta)
    },
    [responder],
  )

  const tentarNovamente = useCallback(
    (idResposta: string) => {
      if (emAndamento.current) return
      const falha = mensagens.find(
        (m) => m.id === idResposta && m.autor === 'assistente' && m.estado === 'erro',
      )
      if (!falha || falha.autor !== 'assistente') return
      setMensagens((atuais) =>
        atuais.map((m) =>
          m.id === idResposta
            ? {
                id: idResposta,
                autor: 'assistente',
                estado: 'carregando',
                pergunta: falha.pergunta,
              }
            : m,
        ),
      )
      void responder(idResposta, falha.pergunta)
    },
    [mensagens, responder],
  )

  const limpar = useCallback(() => {
    emAndamento.current?.abort()
    emAndamento.current = null
    setEnviando(false)
    setMensagens([])
  }, [])

  const abrirPainel = useCallback(() => setPainelAberto(true), [])
  const fecharPainel = useCallback(() => setPainelAberto(false), [])

  const valor = useMemo<Assistente>(
    () => ({
      mensagens,
      enviando,
      perguntar,
      tentarNovamente,
      limpar,
      painelAberto,
      abrirPainel,
      fecharPainel,
    }),
    [
      mensagens,
      enviando,
      perguntar,
      tentarNovamente,
      limpar,
      painelAberto,
      abrirPainel,
      fecharPainel,
    ],
  )

  return <ContextoAssistente.Provider value={valor}>{children}</ContextoAssistente.Provider>
}
