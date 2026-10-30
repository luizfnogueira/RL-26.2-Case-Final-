import type { ReactNode } from 'react'
import { cx } from '@/utils/cx'

export interface ItemDado {
  rotulo: string
  valor: ReactNode
}

/** Pares rótulo → valor de um bloco da Visão 360 (lista de descrição, lida por leitores de tela). */
export default function ListaDados({
  itens,
  className,
}: {
  itens: readonly ItemDado[]
  className?: string
}) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {itens.map(({ rotulo, valor }) => (
        <div key={rotulo} className="min-w-0">
          <dt className="text-legenda text-ink-2">{rotulo}</dt>
          <dd className="text-corpo break-words">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}
