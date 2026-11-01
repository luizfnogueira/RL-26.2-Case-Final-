/** Chave única do token no localStorage (cronograma v5, seção 3). */
export const CHAVE_TOKEN = 'venergy_token'
const EVENTO_SESSAO = 'venergy-sessao-alterada'

/** Notifica os componentes tanto nesta aba quanto em outras abas do portal. */
export function observarToken(atualizar: () => void): () => void {
  const aoArmazenar = (evento: StorageEvent) => {
    if (evento.key === CHAVE_TOKEN || evento.key === null) atualizar()
  }
  window.addEventListener(EVENTO_SESSAO, atualizar)
  window.addEventListener('storage', aoArmazenar)
  return () => {
    window.removeEventListener(EVENTO_SESSAO, atualizar)
    window.removeEventListener('storage', aoArmazenar)
  }
}

/**
 * Único módulo que lê e escreve o token de autenticação. Nenhum outro arquivo toca em
 * `localStorage.venergy_token`. O token nunca vai em URL, log nem para outro domínio além da API.
 *
 * O acesso é protegido: em janela privada ou com dados de site bloqueados o `localStorage` pode
 * lançar erro, e o portal deve seguir funcionando (apenas sem sessão persistente).
 */
export const tokenStorage = {
  get(): string | null {
    try {
      return window.localStorage.getItem(CHAVE_TOKEN)
    } catch {
      return null
    }
  },

  set(token: string): void {
    try {
      window.localStorage.setItem(CHAVE_TOKEN, token)
      window.dispatchEvent(new Event(EVENTO_SESSAO))
    } catch {
      // Sem armazenamento disponível: a sessão vale só até o AuthContext ser recarregado.
    }
  },

  clear(): void {
    try {
      window.localStorage.removeItem(CHAVE_TOKEN)
      window.dispatchEvent(new Event(EVENTO_SESSAO))
    } catch {
      // Nada a limpar.
    }
  },
}
