import { X } from 'lucide-react'
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/utils/cx'

type Props = {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  descricao?: string
  /** Botões de ação, alinhados à direita (confirmar, cancelar). */
  rodape?: ReactNode
  tamanho?: 'sm' | 'md' | 'lg'
  /** Clique no fundo escuro fecha. Desligue em formulários com dados a perder. */
  fecharAoClicarFora?: boolean
  children?: ReactNode
}

const LARGURAS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Janela modal: foco preso dentro dela, Esc fecha, a página atrás não rola e o foco volta ao
 * elemento que a abriu. Renderizada no `body` para não herdar `overflow` nem `z-index` do layout.
 */
export default function Modal(props: Props) {
  return props.aberto ? <ModalAberto {...props} /> : null
}

function ModalAberto({
  aoFechar,
  titulo,
  descricao,
  rodape,
  tamanho = 'md',
  fecharAoClicarFora = true,
  children,
}: Props) {
  const idTitulo = useId()
  const idDescricao = useId()
  const janela = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const primeiro = janela.current?.querySelector<HTMLElement>('[data-foco-inicial]')
    ;(primeiro ?? janela.current)?.focus()
    return () => {
      document.body.style.overflow = overflow
      anterior?.focus?.()
    }
  }, [])

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.stopPropagation()
      aoFechar()
      return
    }
    if (evento.key !== 'Tab' || !janela.current) return
    const itens = [...janela.current.querySelectorAll<HTMLElement>(FOCAVEIS)]
    if (itens.length === 0) {
      evento.preventDefault()
      return
    }
    const primeiro = itens[0]
    const ultimo = itens[itens.length - 1]
    const ativo = document.activeElement
    if (evento.shiftKey && (ativo === primeiro || ativo === janela.current)) {
      evento.preventDefault()
      ultimo.focus()
    } else if (!evento.shiftKey && ativo === ultimo) {
      evento.preventDefault()
      primeiro.focus()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-surface-tinta/50 p-4"
      onMouseDown={(evento) => {
        if (fecharAoClicarFora && evento.target === evento.currentTarget) aoFechar()
      }}
    >
      <div
        ref={janela}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descricao ? idDescricao : undefined}
        tabIndex={-1}
        onKeyDown={aoTeclar}
        className={cx(
          'flex max-h-[90dvh] w-full flex-col rounded-card bg-surface-card shadow-modal outline-none',
          LARGURAS[tamanho],
        )}
      >
        <header className="flex items-start justify-between gap-3 px-6 pt-6">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-titulo-lg font-normal">
              {titulo}
            </h2>
            {descricao && (
              <p id={idDescricao} className="mt-1 text-corpo text-ink-2">
                {descricao}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-alt"
          >
            <X size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        {rodape && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-borda-leve px-6 py-4">
            {rodape}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
