import { ChevronsLeft } from 'lucide-react'
import { Link } from 'react-router'
import Logo from '@/components/common/Logo'
import { cx } from '@/utils/cx'
import NavList from './NavList'

type Props = { recolhido: boolean; onRecolher: () => void }

/** Menu lateral fixo do desktop (≥ 1024 px). */
export default function MenuLateral({ recolhido, onRecolher }: Props) {
  return (
    <aside
      className={cx(
        'sticky top-0 h-dvh w-[280px] shrink-0 flex-col gap-7 overflow-y-auto pb-6 pl-6 pr-4 pt-[34px]',
        recolhido ? 'hidden' : 'hidden lg:flex',
      )}
    >
      <Link to="/painel" aria-label="V-Energy Grid 360: ir para o painel executivo">
        <Logo />
      </Link>
      <NavList variante="completa" />
      <button
        type="button"
        onClick={onRecolher}
        className="group mt-auto flex items-center gap-3 rounded-full px-3.5 py-[9px] text-corpo text-ink-2 transition-colors hover:bg-surface-alt hover:text-ink"
      >
        <ChevronsLeft
          size={22}
          strokeWidth={1.5}
          aria-hidden="true"
          className="text-ink-3 group-hover:text-ink"
        />
        Recolher menu
      </button>
    </aside>
  )
}
