import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  aplicarTema,
  CHAVE_TEMA,
  TemaContexto,
  temaInicial,
  temaSalvo,
  temaDoSistema,
  type Tema,
} from './contexto'

/**
 * Dono do tema claro/escuro. A escolha do usuário fica em localStorage; sem escolha, o portal
 * acompanha a preferência do sistema e reage a ela em tempo real.
 */
export default function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => temaInicial())

  useEffect(() => {
    aplicarTema(tema)
  }, [tema])

  useEffect(() => {
    const consulta = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!consulta) return
    const aoMudar = () => {
      if (!temaSalvo()) setTema(temaDoSistema())
    }
    consulta.addEventListener('change', aoMudar)
    return () => consulta.removeEventListener('change', aoMudar)
  }, [])

  const definirTema = useCallback((novo: Tema) => {
    try {
      window.localStorage.setItem(CHAVE_TEMA, novo)
    } catch {
      // Sem localStorage (modo privado), o tema vale só nesta sessão.
    }
    setTema(novo)
  }, [])

  const alternarTema = useCallback(() => {
    definirTema(tema === 'claro' ? 'escuro' : 'claro')
  }, [definirTema, tema])

  const valor = useMemo(
    () => ({ tema, alternarTema, definirTema }),
    [tema, alternarTema, definirTema],
  )

  return <TemaContexto.Provider value={valor}>{children}</TemaContexto.Provider>
}
