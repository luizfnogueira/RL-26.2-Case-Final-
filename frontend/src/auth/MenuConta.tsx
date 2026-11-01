import { ChevronDown, Pencil } from 'lucide-react'
import { useContext, useEffect, useId, useRef, useState } from 'react'
import Avatar from '@/components/common/Avatar'
import { ContextoAuth } from './contexto'
import EditarPerfil from './EditarPerfil'
import SairDaConta from './SairDaConta'
import { useIdentidade } from './useIdentidade'

export default function MenuConta({ compacto = false }: { compacto?: boolean }) {
  const usuario = useIdentidade()
  const sessao = useContext(ContextoAuth)
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!aberto) return
    function fecharFora(e: PointerEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    function fecharTeclado(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAberto(false)
        botao.current?.focus()
      }
    }
    document.addEventListener('pointerdown', fecharFora)
    document.addEventListener('keydown', fecharTeclado)
    return () => {
      document.removeEventListener('pointerdown', fecharFora)
      document.removeEventListener('keydown', fecharTeclado)
    }
  }, [aberto])
  return (
    <div
      ref={raiz}
      className="relative"
      aria-label={`Conta: ${usuario.nome}`}
      aria-busy={usuario.carregando}
    >
      <button
        ref={botao}
        type="button"
        aria-label={`Opções da conta de ${usuario.nome}`}
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto(!aberto)}
        className="flex items-center gap-2.5 rounded-full text-left"
      >
        {!compacto && (
          <span className="hidden lg:block">
            <span className="block text-titulo text-ink">{usuario.nome}</span>
            <span className="block max-w-48 truncate text-corpo text-ink-2" title={usuario.cargo}>
              {usuario.cargo}
            </span>
          </span>
        )}
        <Avatar iniciais={usuario.iniciais} tamanho={compacto ? 'sm' : 'md'} />
        {!compacto && (
          <ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" className="text-ink-3" />
        )}
      </button>
      {aberto && (
        <div
          id={id}
          role="group"
          aria-label="Opções da conta"
          className="absolute right-0 z-40 mt-2 flex w-64 flex-col gap-2 rounded-card border border-borda bg-surface-card p-3 shadow-card"
        >
          <p className="break-words text-corpo font-medium">{usuario.nome}</p>
          {sessao?.dados && (
            <p className="break-all text-legenda text-ink-2">{sessao.dados.email}</p>
          )}
          {sessao?.dados && (
            <button
              type="button"
              onClick={() => {
                setAberto(false)
                setEditando(true)
              }}
              className="flex items-center gap-2 rounded-md p-2 text-corpo hover:bg-surface-alt"
            >
              <Pencil size={16} aria-hidden="true" /> Editar perfil
            </button>
          )}
          {usuario.erro && (
            <button
              type="button"
              onClick={usuario.recarregar}
              className="rounded-md p-2 text-corpo underline"
            >
              Tentar carregar conta
            </button>
          )}
          <SairDaConta />
        </div>
      )}
      {editando && sessao?.dados && (
        <EditarPerfil
          key={sessao.dados.id}
          usuario={sessao.dados}
          aoFechar={() => {
            setEditando(false)
            botao.current?.focus()
          }}
        />
      )}
    </div>
  )
}
