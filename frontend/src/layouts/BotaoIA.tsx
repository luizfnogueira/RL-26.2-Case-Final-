import { Sparkles } from 'lucide-react'
import { ID_PAINEL_ASSISTENTE, useAssistente } from '@/components/assistente/contexto'

/**
 * Botão flutuante da IA, presente em qualquer tela. Abre o painel do Assistente sem sair da
 * página, mantendo a tela e os filtros atrás dele.
 */
export default function BotaoIA() {
  const { painelAberto, abrirPainel } = useAssistente()
  return (
    <button
      type="button"
      id="botao-ia"
      onClick={abrirPainel}
      aria-label="Pergunte à IA"
      aria-expanded={painelAberto}
      aria-controls={ID_PAINEL_ASSISTENTE}
      className="fixed bottom-6 right-6 z-30 inline-flex size-14 items-center justify-center gap-2 rounded-full bg-azul-300 text-teal-profundo shadow-flutuante transition-colors hover:bg-azul-400 md:h-12 md:w-auto md:px-5"
    >
      <Sparkles size={22} strokeWidth={1.5} aria-hidden="true" />
      <span className="hidden text-titulo font-normal md:inline">Pergunte à IA</span>
    </button>
  )
}
