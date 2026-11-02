import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { LogoMarca } from '@/components/common/Logo'
import BotaoTema from '@/theme/BotaoTema'
import { cx } from '@/utils/cx'
import NavList from './NavList'

type Props = { recolhido: boolean; onExpandir: () => void }

/**
 * Trilho de ícones: é o menu do tablet (768–1023 px) e o menu recolhido do desktop.
 */
export default function MenuTrilho({ recolhido, onExpandir }: Props) {
  return (
    <aside
      className={cx(
        'sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col items-center gap-6 overflow-y-auto border-r border-borda bg-surface-card/70 px-3 py-6 backdrop-blur md:flex',
        !recolhido && 'lg:hidden',
      )}
    >
      <Link to="/painel" aria-label="V-Energy Grid 360: ir para o painel executivo">
        <LogoMarca />
      </Link>
      <NavList variante="trilho" />
      <div className="mt-auto flex flex-col items-center gap-3 border-t border-borda-leve pt-4">
        <BotaoTema compacto />
        <button
          type="button"
          onClick={onExpandir}
          aria-label="Expandir menu"
          title="Expandir menu"
          className="hidden size-10 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-alt hover:text-ink lg:grid"
        >
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
