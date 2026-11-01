import { Loader2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/utils/cx'

export type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'perigo-fantasma'

type Props = ComponentProps<'button'> & {
  variante?: VarianteBotao
  tamanho?: 'md' | 'sm'
  /** Mostra o spinner e bloqueia cliques repetidos enquanto a ação roda. */
  carregando?: boolean
  /** Ícone antes do texto (decorativo). */
  icone?: ReactNode
  /**
   * Por que o botão está desabilitado. Vira `title`, para o usuário entender o bloqueio em vez de
   * clicar e não acontecer nada.
   */
  motivoDesabilitado?: string
}

const VARIANTES: Record<VarianteBotao, string> = {
  primario:
    'bg-azul-300 text-sobre-acao shadow-sm hover:bg-azul-400 active:translate-y-px disabled:hover:bg-azul-300',
  secundario:
    'border border-borda bg-surface-card text-ink hover:border-ink-3 hover:bg-surface-alt',
  fantasma: 'text-teal-escuro hover:bg-azul-50',
  perigo: 'bg-perigo-escuro text-sobre-perigo shadow-sm hover:brightness-110',
  'perigo-fantasma': 'text-perigo-escuro hover:bg-perigo-suave',
}

const TAMANHOS = {
  md: 'h-10 gap-2 px-4 text-corpo',
  sm: 'h-8 gap-1.5 px-3 text-legenda',
}

/**
 * Botão padrão do portal. `type` é "button" por padrão para não enviar formulários sem querer.
 * O estado desabilitado fica visivelmente apagado (cor, contraste e cursor), nunca igual ao ativo.
 */
export default function Button({
  variante = 'primario',
  tamanho = 'md',
  carregando = false,
  icone,
  motivoDesabilitado,
  type = 'button',
  disabled,
  className,
  children,
  ...resto
}: Props) {
  const bloqueado = Boolean(disabled || carregando)
  return (
    <button
      type={type}
      disabled={bloqueado}
      aria-busy={carregando || undefined}
      title={bloqueado && motivoDesabilitado ? motivoDesabilitado : undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,opacity,transform]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:saturate-0',
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
