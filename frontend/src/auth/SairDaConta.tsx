import { LogOut } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { observarToken, tokenStorage } from '@/auth/tokenStorage'
import { rotaAuth } from './fluxo'

/** Encerra a sessão local e retorna ao login, preservando o destino. */
export default function SairDaConta() {
  const navegar = useNavigate()
  const { pathname, search, hash } = useLocation()
  const token = useSyncExternalStore(observarToken, tokenStorage.get, () => null)
  if (!token) return null
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          tokenStorage.clear()
          navegar(rotaAuth('login', `${pathname}${search}${hash}`), {
            replace: true,
            state: null,
          })
        }}
        className="inline-flex items-center gap-2 rounded-full border border-borda bg-surface-card px-4 py-2 text-corpo text-ink-2 hover:bg-surface-alt"
      >
        <LogOut size={16} aria-hidden="true" />
        Sair da conta
      </button>
    </div>
  )
}
