import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '@/utils/cx'

type Props = {
  titulo?: string
  descricao?: string
  icone?: ReactNode
  /** Botão ou link de saída (ex.: limpar filtros). */
  acao?: ReactNode
  className?: string
}

/** Lista ou consulta sem resultado. Diferente de erro: a requisição deu certo e veio vazia. */
export default function EmptyState({
  titulo = 'Nada por aqui',
  descricao = 'Nenhum resultado para os filtros escolhidos.',
  icone,
  acao,
  className,
}: Props) {
  return (
    <div className={cx('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
      <span
        aria-hidden="true"
        className="mb-1 grid size-14 place-items-center rounded-full bg-azul-50 text-teal-escuro"
      >
        {icone ?? <Inbox size={26} strokeWidth={1.5} />}
      </span>
      <h3 className="text-titulo font-normal">{titulo}</h3>
      <p className="max-w-sm text-corpo text-ink-2">{descricao}</p>
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}
