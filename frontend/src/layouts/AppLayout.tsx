import { useState } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import BarraSuperiorMobile from './BarraSuperiorMobile'
import BotaoIA from './BotaoIA'
import MenuLateral from './MenuLateral'
import MenuMobile from './MenuMobile'
import MenuTrilho from './MenuTrilho'
import Rodape from './Rodape'

/**
 * Casca do portal: menu (lateral no desktop, trilho de ícones no tablet, gaveta no celular),
 * área da página, rodapé e botão flutuante da IA.
 */
export default function AppLayout() {
  const [recolhido, setRecolhido] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const { pathname } = useLocation()

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
      {pathname !== '/assistente' && <BotaoIA />}
      <ScrollRestoration />
    </div>
  )
}
