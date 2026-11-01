import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/utils/cx'

type Props = Omit<ComponentProps<'section'>, 'title'> & {
  titulo?: ReactNode
  subtitulo?: ReactNode
  /** Canto direito do cabeçalho (botões, selo, filtros locais). */
  acoes?: ReactNode
}

/** Superfície padrão das telas: borda nítida, raio de 16 px e sombra discreta. */
export default function Card({ titulo, subtitulo, acoes, className, children, ...resto }: Props) {
  return (
    <section
      className={cx(
        'rounded-card border border-borda bg-surface-card p-4 shadow-card md:p-6',
        className,
      )}
      {...resto}
    >
      {(titulo || acoes) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h2 className="text-titulo-lg font-medium">{titulo}</h2>}
            {subtitulo && <p className="text-corpo text-ink-2">{subtitulo}</p>}
          </div>
          {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
