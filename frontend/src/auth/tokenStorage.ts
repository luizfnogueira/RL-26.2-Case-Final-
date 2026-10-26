/** Chave única do token no localStorage (cronograma v5, seção 3). */
export const CHAVE_TOKEN = 'venergy_token'

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
    } catch {
      // Sem armazenamento disponível: a sessão vale só até o AuthContext ser recarregado.
    }
  },

  clear(): void {
    try {
      window.localStorage.removeItem(CHAVE_TOKEN)
    } catch {
      // Nada a limpar.
    }
  },
}
