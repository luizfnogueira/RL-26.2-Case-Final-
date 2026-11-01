import { createContext } from 'react'
import type { ResultadoConsulta } from '@/hooks/useConsulta'
import type { UsuarioAuth } from '@/auth/api'

export interface Sessao extends ResultadoConsulta<UsuarioAuth> {
  token: string | null
  atualizarUsuario: (usuario: UsuarioAuth) => void
}
export const ContextoAuth = createContext<Sessao | null>(null)
