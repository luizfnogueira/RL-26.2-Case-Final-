import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { useConsulta } from '@/hooks/useConsulta'
import { consultarSessao, type UsuarioAuth } from '@/auth/api'
import { ContextoAuth } from './contexto'
import { observarToken, tokenStorage } from './tokenStorage'

/** Identidade obtida de /auth/me; nunca usa os dados de um token anterior no cabeçalho. */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(observarToken, tokenStorage.get, () => null)
  const [perfilSalvo, setPerfilSalvo] = useState<{
    token: string
    base: UsuarioAuth
    novo: UsuarioAuth
  } | null>(null)
  const consulta = useConsulta(consultarSessao, [token], {
    habilitada: Boolean(token),
  })
  return (
    <ContextoAuth
      value={{
        ...consulta,
        token,
        dados:
          token && !consulta.carregando && !consulta.erro
            ? perfilSalvo?.token === token && perfilSalvo.base === consulta.dados
              ? perfilSalvo.novo
              : consulta.dados
            : null,
        atualizarUsuario: (novo) => {
          if (token && consulta.dados?.id === novo.id)
            setPerfilSalvo({ token, base: consulta.dados, novo })
        },
      }}
    >
      {children}
    </ContextoAuth>
  )
}
