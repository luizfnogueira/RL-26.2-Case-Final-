/** Contratos e chamadas de autenticação do portal. */
import { tokenStorage } from '@/auth/tokenStorage'
import { ApiError } from '@/services/erro-api'
import { requisitar } from '@/services/http'

export interface UsuarioAuth {
  id: string
  nome: string
  cargo: string | null
  email: string
  perfil: 'usuario' | 'administrador'
}

export interface CadastroAuth {
  nome: string
  email: string
  senha: string
  convite: string
}

export async function cadastrarNaApi(
  corpo: CadastroAuth,
  sinal: AbortSignal,
): Promise<UsuarioAuth> {
  return requisitar<UsuarioAuth>('POST', '/auth/register', { corpo, sinal })
}

export async function entrarNaApi(
  email: string,
  senha: string,
  sinal: AbortSignal,
): Promise<UsuarioAuth> {
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
  return requisitar<UsuarioAuth>('GET', '/auth/me', { sinal })
}

export function atualizarPerfil(cargo: string | null, sinal: AbortSignal): Promise<UsuarioAuth> {
  return requisitar<UsuarioAuth>('PATCH', '/auth/me', { corpo: { cargo }, sinal })
}
