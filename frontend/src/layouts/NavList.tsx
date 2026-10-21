import { NavLink } from 'react-router'
import { cx } from '@/utils/cx'
import { NAVEGACAO } from './navegacao'

type Props = {
  /** completa: ícone + rótulo (desktop e gaveta mobile). trilho: só ícones (tablet). */
  variante: 'completa' | 'trilho'
  aoNavegar?: () => void
}

export default function NavList({ variante, aoNavegar }: Props) {
  const trilho = variante === 'trilho'
  const coluna = cx('flex flex-col', trilho ? 'items-center gap-1.5' : 'gap-1')

  return (
    <nav aria-label="Navegação principal" className={coluna}>
      {NAVEGACAO.map((grupo, i) => (
        <div key={grupo.rotulo} className={coluna}>
          {trilho ? (
            i > 0 && <span aria-hidden="true" className="my-1 h-px w-6 bg-borda" />
          ) : (
            <p
              className={cx(
                'px-3.5 pb-1 text-micro font-medium uppercase tracking-[0.08em] text-ink-3',
                i === 0 ? 'pt-1' : 'pt-3.5',
              )}
            >
              {grupo.rotulo}
            </p>
          )}
          {grupo.itens.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={aoNavegar}
              title={trilho ? item.rotulo : undefined}
              aria-label={trilho ? item.rotulo : undefined}
              className={({ isActive }) =>
                cx(
                  'group flex items-center rounded-full transition-colors',
                  trilho ? 'h-10 w-12 justify-center' : 'gap-3 px-3.5 py-[9px] text-corpo-lg',
                  isActive
                    ? 'bg-lima font-normal text-ink'
                    : 'text-ink-2 hover:bg-surface-alt hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icone
                    size={22}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className={isActive ? 'text-ink' : 'text-ink-3 group-hover:text-ink'}
                  />
                  {!trilho && <span className="whitespace-nowrap">{item.rotulo}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
