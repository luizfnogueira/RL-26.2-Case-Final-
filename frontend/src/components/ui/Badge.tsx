import type { ComponentProps } from 'react'
import { cx } from '@/utils/cx'

export type VarianteBadge = 'neutro' | 'info' | 'sucesso' | 'alerta' | 'perigo'

type Props = ComponentProps<'span'> & {
  variante?: VarianteBadge
  /** Bolinha colorida antes do texto, para status. */
  ponto?: boolean
}

const VARIANTES: Record<VarianteBadge, { caixa: string; ponto: string }> = {
  neutro: { caixa: 'bg-surface-alt text-ink', ponto: 'bg-ink-3' },
  info: { caixa: 'bg-azul-50 text-teal-profundo', ponto: 'bg-teal' },
  sucesso: { caixa: 'bg-sucesso-suave text-sucesso-texto', ponto: 'bg-lima-escuro' },
  alerta: { caixa: 'bg-alerta-suave text-alerta-escuro', ponto: 'bg-alerta' },
  perigo: { caixa: 'bg-perigo-suave text-perigo-escuro', ponto: 'bg-perigo' },
}

/** Etiqueta de status, motivo ou categoria. A cor nunca é a única pista: sempre leva texto. */
export default function Badge({
  variante = 'neutro',
  ponto = false,
  className,
  children,
  ...resto
}: Props) {
  const estilo = VARIANTES[variante]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-legenda font-normal whitespace-nowrap',
        estilo.caixa,
        className,
      )}
      {...resto}
    >
      {ponto && <span aria-hidden="true" className={cx('size-1.5 rounded-full', estilo.ponto)} />}
      {children}
    </span>
  )
}
