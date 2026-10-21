import { Menu } from 'lucide-react'
import { Link } from 'react-router'
import Avatar from '@/components/common/Avatar'
import { LogoMarca } from '@/components/common/Logo'
import { USUARIO_MOCK } from '@/data/usuario.mock'

type Props = { onAbrirMenu: () => void }

/** Barra superior do celular (< 768 px): abre a gaveta de navegação. */
export default function BarraSuperiorMobile({ onAbrirMenu }: Props) {
  return (
    <header className="flex items-center justify-between px-4 py-3 md:hidden">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          aria-haspopup="dialog"
          className="grid size-10 place-items-center rounded-full bg-surface-card text-ink shadow-card"
        >
          <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <Link to="/painel" className="flex items-center gap-2" aria-label="V-Energy Grid 360">
          <LogoMarca tamanho="sm" />
          <span className="text-titulo-lg font-normal text-marca">V-Energy</span>
        </Link>
      </div>
      <Avatar iniciais={USUARIO_MOCK.iniciais} tamanho="sm" />
    </header>
  )
}
