import { NavLink } from 'react-router'
import { cx } from '@/utils/cx'
import { NAVEGACAO } from './navegacao'

type Props = {
  /** completa: ícone + rótulo (desktop e gaveta mobile). trilho: só ícones (tablet). */
  variante: 'completa' | 'trilho'
  aoNavegar?: () => void
}

/** Lista plana de navegação: um item por tela, sem grupos nem descrições. */
export default function NavList({ variante, aoNavegar }: Props) {
  const trilho = variante === 'trilho'

  return (
    <nav
      aria-label="Navegação principal"
      className={cx('flex flex-col', trilho ? 'items-center gap-1.5' : 'gap-1')}
    >
      {NAVEGACAO.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={aoNavegar}
          title={trilho ? item.rotulo : undefined}
          aria-label={trilho ? item.rotulo : undefined}
          className={({ isActive }) =>
            cx(
              'group flex items-center rounded-md font-medium transition-colors',
              trilho ? 'size-11 justify-center' : 'gap-3 px-3 py-2.5 text-corpo',
              isActive
                ? 'bg-lima text-sobre-lima shadow-sm'
                : 'text-ink-2 hover:bg-surface-alt hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icone
                size={20}
                strokeWidth={1.75}
                aria-hidden="true"
                className={isActive ? 'text-sobre-lima' : 'text-ink-3 group-hover:text-ink'}
              />
              {!trilho && <span className="whitespace-nowrap">{item.rotulo}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
