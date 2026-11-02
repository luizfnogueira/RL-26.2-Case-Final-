import { createContext, useContext } from 'react'

export type Tema = 'claro' | 'escuro'

export const CHAVE_TEMA = 'venergy:tema'

export type ContextoTema = {
  tema: Tema
  alternarTema: () => void
  definirTema: (tema: Tema) => void
}

export const TemaContexto = createContext<ContextoTema | null>(null)

const TEMA_SEM_PROVIDER: ContextoTema = {
  tema: 'claro',
  alternarTema: () => {},
  definirTema: () => {},
}

/**
 * Tema atual e como alterná-lo. Fora de <TemaProvider> devolve o tema claro sem efeitos, para que
 * componentes isolados (como o BotaoTema no cabeçalho) possam ser renderizados em testes.
 */
export function useTema(): ContextoTema {
  return useContext(TemaContexto) ?? TEMA_SEM_PROVIDER
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
