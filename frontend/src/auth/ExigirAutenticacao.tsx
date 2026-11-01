import { useContext, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import ErrorState from '@/components/ui/ErrorState'
import { ContextoAuth } from './contexto'
import { rotaAuth } from './fluxo'
import SairDaConta from './SairDaConta'
import { useRetornoAoLogin } from './useRetornoAoLogin'

export default function ExigirAutenticacao({ children }: { children: ReactNode }) {
  const sessao = useContext(ContextoAuth)
  const { pathname, search, hash } = useLocation()
  useRetornoAoLogin()
  if (!sessao?.token)
    return <Navigate to={rotaAuth('login', `${pathname}${search}${hash}`)} replace />
  if (sessao.erro)
    return (
      <main className="mx-auto max-w-lg p-6">
        <ErrorState erro={sessao.erro} aoTentarNovamente={sessao.recarregar} />
        <SairDaConta />
      </main>
    )
  if (sessao.carregando || !sessao.dados)
    return (
      <main className="grid min-h-dvh place-content-center gap-4 bg-filo text-ink">
        <p role="status" aria-busy="true">
          Conferindo seu acesso…
        </p>
        <SairDaConta />
      </main>
    )
  return children
}
