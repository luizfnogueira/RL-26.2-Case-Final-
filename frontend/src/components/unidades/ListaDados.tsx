import type { ReactNode } from 'react'
import { cx } from '@/utils/cx'

export interface ItemDado {
  rotulo: string
  valor: ReactNode
}

/**
 * Pares rótulo → valor de um bloco da Visão 360 (lista de descrição, lida por leitores de tela).
 * `colunas` vale a partir de `sm`; no celular é sempre uma. Por prop, e não por `className`: um
 * `sm:grid-cols-1` passado de fora perdia para o `sm:grid-cols-2` daqui, que vem depois no CSS.
 */
export default function ListaDados({
  itens,
  colunas = 2,
  className,
}: {
  itens: readonly ItemDado[]
  colunas?: 1 | 2
  className?: string
}) {
  return (
    <dl
      className={cx(
        'grid grid-cols-1 gap-x-6 gap-y-3',
        colunas === 2 && 'sm:grid-cols-2',
        className,
      )}
    >
      {itens.map(({ rotulo, valor }) => (
        <div key={rotulo} className="min-w-0">
          <dt className="text-legenda text-ink-2">{rotulo}</dt>
          <dd className="text-corpo break-words">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}
