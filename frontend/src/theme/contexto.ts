import { createContext, useContext } from 'react'

export type Tema = 'claro' | 'escuro'

export const CHAVE_TEMA = 'venergy:tema'

export type ContextoTema = {
  tema: Tema
  alternarTema: () => void
  definirTema: (tema: Tema) => void
}

export const TemaContexto = createContext<ContextoTema | null>(null)

/** Tema atual e como alterná-lo. Precisa estar dentro de <TemaProvider>. */
export function useTema(): ContextoTema {
  const contexto = useContext(TemaContexto)
  if (!contexto) throw new Error('useTema precisa estar dentro de <TemaProvider>')
  return contexto
}

/** Preferência salva pelo usuário, se houver. */
export function temaSalvo(): Tema | null {
  try {
    const valor = window.localStorage.getItem(CHAVE_TEMA)
    return valor === 'claro' || valor === 'escuro' ? valor : null
  } catch {
    return null
  }
}

/** Tema do sistema, usado enquanto o usuário não escolheu um. */
export function temaDoSistema(): Tema {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'
}

export function temaInicial(): Tema {
  return temaSalvo() ?? temaDoSistema()
}

/** Aplica o tema no <html>; o CSS lê `data-tema` para trocar as variáveis. */
export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.tema = tema
}
