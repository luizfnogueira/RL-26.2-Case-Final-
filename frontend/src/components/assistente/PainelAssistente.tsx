import { Maximize2, Sparkles, X } from 'lucide-react'
import { useEffect, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import ChatAssistente from './ChatAssistente'
import { ID_PAINEL_ASSISTENTE, useAssistente } from './contexto'

/**
 * Painel lateral do Assistente, aberto pelo botão flutuante em qualquer tela. Não é modal: a
 * página continua visível e com os mesmos filtros, e a conversa segue ao trocar de tela.
 */
export default function PainelAssistente() {
  const { fecharPainel } = useAssistente()

  // Ao fechar, o foco volta ao botão flutuante que abriu o painel.
  useEffect(
    () => () => {
      requestAnimationFrame(() => document.getElementById('botao-ia')?.focus())
    },
    [],
  )

  function aoTeclar(evento: KeyboardEvent<HTMLElement>) {
    if (evento.key === 'Escape') {
      evento.stopPropagation()
      fecharPainel()
    }
  }

  return (
    <aside
      id={ID_PAINEL_ASSISTENTE}
      aria-label="Assistente V-Energy"
      onKeyDown={aoTeclar}
      className="fixed inset-0 z-40 flex flex-col bg-surface-card p-4 shadow-modal sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[440px] sm:rounded-l-card"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-titulo-lg font-normal">
          <Sparkles size={20} strokeWidth={1.5} aria-hidden="true" className="text-teal-escuro" />
          Assistente V-Energy
        </h2>
        <div className="flex items-center gap-1">
          <Link
            to="/assistente"
            onClick={fecharPainel}
            aria-label="Abrir o assistente em tela cheia"
            title="Abrir em tela cheia"
            className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface-alt"
          >
            <Maximize2 size={18} strokeWidth={1.5} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={fecharPainel}
            aria-label="Fechar o assistente"
            className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface-alt"
          >
            <X size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </header>
      <ChatAssistente variante="painel" focarAoAbrir />
    </aside>
  )
}
