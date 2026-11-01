import { useEffect } from 'react'
import { X } from 'lucide-react'
import Logo from '@/components/common/Logo'
import BotaoTema from '@/theme/BotaoTema'
import NavList from './NavList'

type Props = { aberto: boolean; onFechar: () => void }

/** Gaveta de navegação do celular. Fecha com Esc, clique fora ou ao navegar. */
export default function MenuMobile({ aberto, onFechar }: Props) {
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button
        type="button"
        aria-label="Fechar menu"
        tabIndex={-1}
        onClick={onFechar}
        className="absolute inset-0 bg-surface-tinta/60 backdrop-blur-[2px]"
      />
      <div className="relative flex h-full w-[300px] max-w-[85%] flex-col gap-8 overflow-y-auto rounded-r-card border-r border-borda bg-surface-card p-5 shadow-modal">
        <div className="flex items-center justify-between">
          <Logo />
          <button
            type="button"
            autoFocus
            onClick={onFechar}
            aria-label="Fechar menu"
            className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-surface-alt hover:text-ink"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <NavList variante="completa" aoNavegar={onFechar} />
        <div className="mt-auto border-t border-borda-leve pt-4">
          <BotaoTema />
        </div>
      </div>
    </div>
  )
}
