import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { normalizarErro } from '@/services/erro-api'
import { atualizarPerfil, type UsuarioAuth } from './api'
import { ContextoAuth } from './contexto'
import { tokenStorage } from './tokenStorage'

export default function EditarPerfil({
  usuario,
  aoFechar,
}: {
  usuario: UsuarioAuth
  aoFechar: () => void
}) {
  const sessao = useContext(ContextoAuth)
  const [cargo, setCargo] = useState(usuario.cargo ?? '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const controle = useRef<AbortController | null>(null)
  const aviso = useRef<HTMLParagraphElement>(null)
  useEffect(() => () => controle.current?.abort(), [])
  useEffect(() => {
    if (erro) aviso.current?.focus()
  }, [erro])
  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (controle.current) return
    if (cargo.trim().length > 80) {
      setErro('Use até 80 caracteres no cargo ou área.')
      return
    }
    const requisicao = new AbortController()
    controle.current = requisicao
    const token = tokenStorage.get()
    setErro(null)
    setEnviando(true)
    try {
      const atualizado = await atualizarPerfil(cargo.trim() || null, requisicao.signal)
      if (!requisicao.signal.aborted && tokenStorage.get() === token) {
        sessao?.atualizarUsuario(atualizado)
        aoFechar()
      }
    } catch (e) {
      if (!requisicao.signal.aborted) setErro(normalizarErro(e).mensagem)
    } finally {
      if (!requisicao.signal.aborted) {
        controle.current = null
        setEnviando(false)
      }
    }
  }
  return (
    <Modal
      aberto
      titulo="Editar perfil"
      descricao="Escolha como seu cargo ou área aparece abaixo do nome."
      aoFechar={aoFechar}
      fecharAoClicarFora={false}
    >
      <form onSubmit={salvar} className="flex flex-col gap-4" aria-label="Editar perfil">
        <div>
          <p className="text-titulo">{usuario.nome}</p>
          <p className="text-corpo text-ink-2">{usuario.email}</p>
        </div>
        <Input
          rotulo="Cargo ou área"
          name="cargo"
          value={cargo}
          onChange={(e) => {
            setCargo(e.target.value)
            setErro(null)
          }}
          maxLength={80}
          data-foco-inicial
          ajuda="Opcional, até 80 caracteres. Deixe vazio para usar o perfil de acesso."
          placeholder="Ex.: Analista de Operação"
          disabled={enviando}
        />
        <p className="text-legenda text-ink-2">
          Este texto é de apresentação. As permissões da conta são definidas pela equipe.
        </p>
        {erro && (
          <p ref={aviso} role="alert" tabIndex={-1} className="text-corpo text-perigo-escuro">
            {erro}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" carregando={enviando}>
            Salvar alterações
          </Button>
        </div>
      </form>
    </Modal>
  )
}
