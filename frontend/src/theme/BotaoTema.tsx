import { Moon, Sun } from 'lucide-react'
import { useTema } from './contexto'

/** Alterna claro/escuro. O rótulo descreve o que o clique faz, não o estado atual. */
export default function BotaoTema({ compacto = false }: { compacto?: boolean }) {
  const { tema, alternarTema } = useTema()
  const escuro = tema === 'escuro'
  return (
    <button
      type="button"
      onClick={alternarTema}
      aria-label={escuro ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={escuro ? 'Tema claro' : 'Tema escuro'}
      aria-pressed={escuro}
      className={
        compacto
          ? 'grid size-10 place-items-center rounded-full border border-borda bg-surface-card text-ink-2 transition-colors hover:bg-surface-alt hover:text-ink'
          : 'inline-flex h-9 items-center gap-2 rounded-full border border-borda bg-surface-card px-3 text-legenda font-medium text-ink-2 transition-colors hover:bg-surface-alt hover:text-ink'
      }
    >
      {escuro ? (
        <Sun size={compacto ? 18 : 15} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon size={compacto ? 18 : 15} strokeWidth={1.75} aria-hidden="true" />
      )}
      {!compacto && <span>{escuro ? 'Tema claro' : 'Tema escuro'}</span>}
    </button>
  )
}
