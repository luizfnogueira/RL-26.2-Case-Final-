import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { LogoMarca } from '@/components/common/Logo'
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
        'sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center gap-6 overflow-y-auto px-3 pb-6 pt-7 md:flex',
        !recolhido && 'lg:hidden',
      )}
    >
      <Link to="/painel" aria-label="V-Energy Grid 360: ir para o painel executivo">
        <LogoMarca />
      </Link>
      <NavList variante="trilho" />
      <button
        type="button"
        onClick={onExpandir}
        aria-label="Expandir menu"
        title="Expandir menu"
        className="mt-auto hidden h-10 w-12 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-alt hover:text-ink lg:grid"
      >
        <ChevronRight size={22} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </aside>
  )
}
