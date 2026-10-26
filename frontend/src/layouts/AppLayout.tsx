import { useEffect, useState } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import AssistenteProvider from '@/components/assistente/AssistenteProvider'
import { useAssistente } from '@/components/assistente/contexto'
import PainelAssistente from '@/components/assistente/PainelAssistente'
import BarraSuperiorMobile from './BarraSuperiorMobile'
import BotaoIA from './BotaoIA'
import MenuLateral from './MenuLateral'
import MenuMobile from './MenuMobile'
import MenuTrilho from './MenuTrilho'
import Rodape from './Rodape'

/** Botão flutuante ou painel do Assistente. Na tela /assistente a conversa já ocupa a página. */
function AreaAssistente() {
  const { painelAberto, fecharPainel } = useAssistente()
  const { pathname } = useLocation()
  const naTelaDoAssistente = pathname === '/assistente'

  useEffect(() => {
    if (naTelaDoAssistente) fecharPainel()
  }, [naTelaDoAssistente, fecharPainel])

  if (naTelaDoAssistente) return null
  return painelAberto ? <PainelAssistente /> : <BotaoIA />
}

/**
 * Casca do portal: menu (lateral no desktop, trilho de ícones no tablet, gaveta no celular),
 * área da página, rodapé e Assistente (botão flutuante e painel), com a conversa guardada
 * enquanto o usuário troca de tela.
 */
export default function AppLayout() {
  return (
    <AssistenteProvider>
      <Casca />
    </AssistenteProvider>
  )
}

function Casca() {
  const [recolhido, setRecolhido] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <div className="min-h-dvh bg-filo font-sans text-ink">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface-card focus:px-4 focus:py-2"
      >
        Ir para o conteúdo
      </a>
      <BarraSuperiorMobile onAbrirMenu={() => setMenuAberto(true)} />
      <MenuMobile aberto={menuAberto} onFechar={() => setMenuAberto(false)} />
      <div className="md:flex">
        <MenuLateral recolhido={recolhido} onRecolher={() => setRecolhido(true)} />
        <MenuTrilho recolhido={recolhido} onExpandir={() => setRecolhido(false)} />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <main
            id="conteudo"
            className="flex-1 px-4 pt-1 md:pl-3 md:pr-6 md:pt-7 lg:pl-0 lg:pr-[43px] lg:pt-[34px]"
          >
            <Outlet />
          </main>
          <Rodape />
        </div>
      </div>
      <AreaAssistente />
      <ScrollRestoration />
    </div>
  )
}
