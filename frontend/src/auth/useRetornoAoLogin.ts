import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { rotaAuth } from '@/auth/fluxo'
import { aoNaoAutorizado } from './naoAutorizado'

/** Sessão inválida retorna ao formulário de login, mantendo o recorte de destino. */
export function useRetornoAoLogin(destino?: string) {
  const navegar = useNavigate()
  const { pathname, search, hash } = useLocation()
  useEffect(() => {
    return aoNaoAutorizado(() =>
      navegar(rotaAuth('login', destino ?? `${pathname}${search}${hash}`), {
        replace: true,
        state: { sessaoExpirada: true },
      }),
    )
  }, [navegar, destino, pathname, search, hash])
}
