import type { ReactNode } from 'react'
import { cx } from '@/utils/cx'

type Props = {
  /** `id` do controle: liga o rótulo, a ajuda e o erro. */
  id: string
  rotulo: string
  /** Esconde o rótulo visualmente, mantendo-o para leitores de tela. */
  rotuloOculto?: boolean
  ajuda?: string
  erro?: string
  className?: string
  children: ReactNode
}

/** Rótulo + controle + ajuda/erro. Base de Input e Select. */
export default function Campo({
  id,
  rotulo,
  rotuloOculto,
  ajuda,
  erro,
  className,
  children,
}: Props) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className={cx(rotuloOculto ? 'sr-only' : 'text-legenda font-medium text-ink')}
      >
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-legenda text-perigo-escuro">
          {erro}
        </p>
      ) : (
        ajuda && (
          <p id={`${id}-ajuda`} className="text-legenda text-ink-2">
            {ajuda}
          </p>
        )
      )}
    </div>
  )
}
