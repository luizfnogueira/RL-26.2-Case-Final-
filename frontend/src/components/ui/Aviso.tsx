import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '@/utils/cx'

export type VarianteAviso = 'info' | 'sucesso' | 'alerta' | 'perigo'

type Props = {
  variante?: VarianteAviso
  titulo?: ReactNode
  children: ReactNode
  /** Ação à direita (link ou botão). */
  acao?: ReactNode
  /** Anuncia a mensagem a leitores de tela assim que aparece. */
  anunciar?: boolean
  className?: string
}

const ESTILOS: Record<VarianteAviso, { caixa: string; icone: ReactNode }> = {
  info: {
    caixa: 'border-teal/25 bg-azul-50 text-teal-profundo',
    icone: <Info size={18} strokeWidth={1.75} aria-hidden="true" />,
  },
  sucesso: {
    caixa: 'border-sucesso-texto/25 bg-sucesso-suave text-sucesso-texto',
    icone: <CircleCheck size={18} strokeWidth={1.75} aria-hidden="true" />,
  },
  alerta: {
    caixa: 'border-alerta/30 bg-alerta-suave text-alerta-escuro',
    icone: <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />,
  },
  perigo: {
    caixa: 'border-perigo/25 bg-perigo-suave text-perigo-escuro',
    icone: <CircleAlert size={18} strokeWidth={1.75} aria-hidden="true" />,
  },
}

/** Faixa de aviso do portal: mensagens de sistema, confirmações e alertas inline. */
export default function Aviso({
  variante = 'info',
  titulo,
  children,
  acao,
  anunciar = false,
  className,
}: Props) {
  const estilo = ESTILOS[variante]
  return (
    <div
      role={anunciar ? 'status' : undefined}
      aria-live={anunciar ? 'polite' : undefined}
      className={cx(
        'flex flex-col gap-2 rounded-md border px-4 py-3 text-corpo sm:flex-row sm:items-start',
        estilo.caixa,
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{estilo.icone}</span>
      <div className="min-w-0 flex-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        <div className={cx(Boolean(titulo) && 'mt-0.5')}>{children}</div>
      </div>
      {acao && <div className="shrink-0 self-center">{acao}</div>}
    </div>
  )
}
