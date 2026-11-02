import { Menu } from 'lucide-react'
import { Link } from 'react-router'
import MenuConta from '@/auth/MenuConta'
import { LogoMarca } from '@/components/common/Logo'
import BotaoTema from '@/theme/BotaoTema'

type Props = { onAbrirMenu: () => void }

/** Barra superior do celular (< 768 px): abre a gaveta de navegação. */
export default function BarraSuperiorMobile({ onAbrirMenu }: Props) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-borda bg-surface-card/90 px-4 py-2.5 backdrop-blur md:hidden">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          aria-haspopup="dialog"
          className="grid size-10 place-items-center rounded-md border border-borda bg-surface-card text-ink"
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <Link to="/painel" className="flex items-center gap-2" aria-label="V-Energy Grid 360">
          <LogoMarca tamanho="sm" />
          <span className="text-titulo font-semibold text-marca">V-Energy</span>
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <BotaoTema compacto />
        <MenuConta compacto />
      </div>
    </header>
  )
}
