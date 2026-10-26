import { Loader2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/utils/cx'

export type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo'

type Props = ComponentProps<'button'> & {
  variante?: VarianteBotao
  tamanho?: 'md' | 'sm'
  /** Mostra o spinner e bloqueia cliques repetidos enquanto a ação roda. */
  carregando?: boolean
  /** Ícone antes do texto (decorativo). */
  icone?: ReactNode
}

const VARIANTES: Record<VarianteBotao, string> = {
  primario: 'bg-azul-300 text-ink hover:bg-azul-400',
  secundario: 'border border-borda bg-surface-card text-ink hover:bg-surface-alt',
  fantasma: 'text-teal-escuro hover:bg-azul-50',
  perigo: 'bg-perigo-escuro text-ink-inverso hover:bg-[#9e3636]',
}

const TAMANHOS = {
  md: 'h-10 gap-2 px-5 text-corpo',
  sm: 'h-8 gap-1.5 px-3 text-legenda',
}

/** Botão em pílula da identidade FILO. `type` é "button" por padrão para não enviar formulários sem querer. */
export default function Button({
  variante = 'primario',
  tamanho = 'md',
  carregando = false,
  icone,
  type = 'button',
  disabled,
  className,
  children,
  ...resto
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-normal whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
      {...resto}
    >
      {carregando ? (
        <Loader2 aria-hidden="true" size={tamanho === 'sm' ? 14 : 18} className="animate-spin" />
      ) : (
        icone
      )}
      {children}
    </button>
  )
}
