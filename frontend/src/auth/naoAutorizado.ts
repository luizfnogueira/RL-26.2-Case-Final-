import { tokenStorage } from './tokenStorage'

type Gancho = () => void

let gancho: Gancho | null = null

/**
 * Registra o que fazer quando a API responde 401 (token ausente, expirado ou adulterado).
 * O AuthContext usa isto para zerar o usuário em memória e navegar para /login pelo roteador.
 * Retorna a função que remove o registro (para o `useEffect` do provedor).
 */
export function aoNaoAutorizado(funcao: Gancho): () => void {
  gancho = funcao
  return () => {
    if (gancho === funcao) gancho = null
  }
}

/** "/receita?municipio=Recife" → "/login?destino=%2Freceita%3Fmunicipio%3DRecife". */
export function montarUrlLogin(caminho: string, busca: string): string {
  if (caminho.startsWith('/login')) return '/login'
  return `/login?destino=${encodeURIComponent(`${caminho}${busca}`)}`
}

/**
 * Ponto único de tratamento do 401: limpa o token e leva ao login, voltando ao destino depois.
 * Sem gancho registrado, navega pelo navegador. A tela /login deve aceitar `destino` só quando
 * for um caminho do próprio portal (começa com "/" e não com "//"), para não virar redirecionamento aberto.
 */
export function tratarNaoAutorizado(): void {
  tokenStorage.clear()
  if (gancho) {
    gancho()
    return
  }
  const { pathname, search } = window.location
  if (pathname.startsWith('/login')) return
  window.location.replace(montarUrlLogin(pathname, search))
}
