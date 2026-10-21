import { Sparkles } from 'lucide-react'
import { Link } from 'react-router'

/**
 * Botão flutuante da IA, presente em qualquer tela. Por enquanto leva à tela do Assistente;
 * a tarefa F6 troca por um painel que abre sem perder o contexto da página.
 */
export default function BotaoIA() {
  return (
    <Link
      to="/assistente"
      aria-label="Pergunte à IA"
      className="fixed bottom-6 right-6 z-30 inline-flex size-14 items-center justify-center gap-2 rounded-full bg-azul-300 text-teal-profundo shadow-flutuante transition-colors hover:bg-azul-400 md:h-12 md:w-auto md:px-5"
    >
      <Sparkles size={22} strokeWidth={1.5} aria-hidden="true" />
      <span className="hidden text-titulo font-normal md:inline">Pergunte à IA</span>
    </Link>
  )
}
