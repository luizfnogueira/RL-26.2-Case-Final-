/** `aria-describedby` coerente com o que o Campo renderiza: o erro tem prioridade sobre a ajuda. */
export function descricaoDoCampo(id: string, ajuda?: string, erro?: string): string | undefined {
  if (erro) return `${id}-erro`
  return ajuda ? `${id}-ajuda` : undefined
}

/** Estilo compartilhado de Input e Select (a cor da borda muda com o erro). */
export const ESTILO_CONTROLE =
  'h-10 w-full rounded-md border bg-surface-card px-3 text-corpo text-ink placeholder:text-ink-3 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-ink-3'
