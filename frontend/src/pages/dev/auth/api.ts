/** Integração provisória da prévia de AUTH-b; reutiliza o cliente HTTP da equipe. */
import { tokenStorage } from '@/auth/tokenStorage'
import { USE_MOCKS } from '@/services/env'
import { ApiError } from '@/services/erro-api'
import { requisitar } from '@/services/http'

export const AUTH_PREVIEW_API =
  import.meta.env.DEV && import.meta.env.VITE_AUTH_PREVIEW_API === 'true'

export interface UsuarioAuth {
  id: string
  nome: string
  email: string
  perfil: 'usuario' | 'administrador'
}

export interface CadastroAuth {
  nome: string
  email: string
  senha: string
}

function exigirApi() {
  if (USE_MOCKS)
    throw new ApiError(
      503,
      'AUTH_INDISPONIVEL',
      'A prévia de acesso precisa estar conectada à API real.',
    )
}

export async function cadastrarNaApi(
  corpo: CadastroAuth,
  sinal: AbortSignal,
): Promise<UsuarioAuth> {
  exigirApi()
  return requisitar<UsuarioAuth>('POST', '/auth/register', { corpo, sinal })
}

export async function entrarNaApi(
  email: string,
  senha: string,
  sinal: AbortSignal,
): Promise<UsuarioAuth> {
  exigirApi()
  const sessao = await requisitar<{
    access_token: string
    token_type: 'bearer'
    usuario: UsuarioAuth
  }>('POST', '/auth/login', { corpo: { email, senha }, sinal })
  sinal.throwIfAborted()
  tokenStorage.set(sessao.access_token)
  // O cliente compartilhado lê a sessão do armazenamento. Se este estiver bloqueado,
  // não afirmar que o acesso foi concluído enquanto as próximas chamadas falhariam.
  if (tokenStorage.get() !== sessao.access_token) {
    tokenStorage.clear()
    throw new ApiError(
      0,
      'SESSAO_NAO_SALVA',
      'Permita o armazenamento deste site para manter sua sessão e tente novamente.',
    )
  }
  return sessao.usuario
}

export function consultarSessao(sinal: AbortSignal): Promise<UsuarioAuth> {
  exigirApi()
  return requisitar<UsuarioAuth>('GET', '/auth/me', { sinal })
}
