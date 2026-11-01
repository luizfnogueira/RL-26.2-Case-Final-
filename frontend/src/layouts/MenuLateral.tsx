import { ChevronsLeft } from 'lucide-react'
import { Link } from 'react-router'
import Logo from '@/components/common/Logo'
import BotaoTema from '@/theme/BotaoTema'
import { cx } from '@/utils/cx'
import NavList from './NavList'

type Props = { recolhido: boolean; onRecolher: () => void }

/** Menu lateral fixo do desktop (≥ 1024 px): lista plana, sem grupos nem descrições. */
export default function MenuLateral({ recolhido, onRecolher }: Props) {
  return (
    <aside
      className={cx(
        'sticky top-0 h-dvh w-64 shrink-0 flex-col gap-8 overflow-y-auto border-r border-borda bg-surface-card/70 px-4 py-6 backdrop-blur',
        recolhido ? 'hidden' : 'hidden lg:flex',
      )}
    >
      <Link
        to="/painel"
        aria-label="V-Energy Grid 360: ir para o painel executivo"
        className="px-2"
      >
        <Logo />
      </Link>
      <NavList variante="completa" />
      <div className="mt-auto flex flex-col gap-2 border-t border-borda-leve pt-4">
        <BotaoTema />
        <button
          type="button"
          onClick={onRecolher}
          className="group flex items-center gap-3 rounded-md px-3 py-2 text-corpo font-medium text-ink-2 transition-colors hover:bg-surface-alt hover:text-ink"
        >
          <ChevronsLeft
            size={20}
            strokeWidth={1.75}
            aria-hidden="true"
            className="text-ink-3 group-hover:text-ink"
          />
          Recolher menu
        </button>
      </div>
    </aside>
  )
}
