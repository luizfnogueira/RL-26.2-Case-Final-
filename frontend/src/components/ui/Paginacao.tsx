import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from '@/utils/cx'
import { paginasVisiveis } from './paginas'

export interface PaginacaoProps {
  /** Página atual, a partir de 1. */
  page: number
  pageSize: number
  /** Total após filtros e antes da paginação (o `total` da API). */
  total: number
  aoMudar: (page: number) => void
  className?: string
}

const BOTAO =
  'grid size-9 place-items-center rounded-full text-corpo transition-colors disabled:cursor-not-allowed disabled:opacity-40'

/** Navegação entre páginas de uma lista paginada no servidor ("21–40 de 134"). */
export default function Paginacao({ page, pageSize, total, aoMudar, className }: PaginacaoProps) {
  const ultima = Math.max(1, Math.ceil(total / pageSize))
  const atual = Math.min(Math.max(1, page), ultima)
  const inicio = total === 0 ? 0 : (atual - 1) * pageSize + 1
  const fim = Math.min(atual * pageSize, total)

  return (
    <nav
      aria-label="Paginação"
      className={cx('flex flex-wrap items-center justify-between gap-3', className)}
    >
      <p className="text-legenda text-ink-2" aria-live="polite">
        {inicio}–{fim} de {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={atual <= 1}
          onClick={() => aoMudar(atual - 1)}
          className={cx(BOTAO, 'text-ink hover:bg-azul-50')}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        {paginasVisiveis(atual, ultima).map((pagina, i) =>
          pagina === null ? (
            <span key={`espaco-${i}`} aria-hidden="true" className="px-1 text-ink-3">
              …
            </span>
          ) : (
            <button
              key={pagina}
              type="button"
              aria-label={`Página ${pagina}`}
              aria-current={pagina === atual ? 'page' : undefined}
              onClick={() => aoMudar(pagina)}
              className={cx(
                BOTAO,
                pagina === atual ? 'bg-lima text-ink' : 'text-ink hover:bg-azul-50',
              )}
            >
              {pagina}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Próxima página"
          disabled={atual >= ultima}
          onClick={() => aoMudar(atual + 1)}
          className={cx(BOTAO, 'text-ink hover:bg-azul-50')}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
