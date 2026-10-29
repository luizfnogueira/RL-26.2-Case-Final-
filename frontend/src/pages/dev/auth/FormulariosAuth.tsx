import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react'
import { Link } from 'react-router'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  CONVITE_EXEMPLO,
  EXEMPLO,
  mensagemDoCenario,
  SENHA_EXEMPLO,
  type CenarioEnvio,
} from './fluxo'

type PessoaExemplo = { nome: string; email: string }

/** Pausa visual cancelada ao trocar de tela; não executa requisições. */
function useEnvioVisual() {
  const [enviando, setEnviando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )
  function enviar(concluir: () => void) {
    if (timer.current !== null) return
    setEnviando(true)
    timer.current = setTimeout(
      () => {
        timer.current = null
        setEnviando(false)
        concluir()
      },
      import.meta.env.MODE === 'test' ? 0 : 450,
    )
  }
  return { enviando, enviar }
}

function Senha({
  rotulo,
  valor,
  aoMudar,
  erro,
  confirmar = false,
  disabled,
}: {
  rotulo: string
  valor: string
  aoMudar: (valor: string) => void
  erro?: string
  confirmar?: boolean
  disabled: boolean
}) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="relative">
      <Input
        rotulo={rotulo}
        type={visivel ? 'text' : 'password'}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        required
        minLength={8}
        autoComplete={confirmar ? 'new-password' : 'off'}
        disabled={disabled}
        erro={erro}
        className="h-12! pr-12"
      />
      <button
        type="button"
        aria-label={`${visivel ? 'Ocultar' : 'Mostrar'} ${rotulo.toLocaleLowerCase('pt-BR')}`}
        aria-pressed={visivel}
        onClick={() => setVisivel(!visivel)}
        className="absolute top-7 right-3 rounded-sm p-1 text-ink-2 hover:text-teal-profundo"
      >
        {visivel ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </div>
  )
}

function AvisoErro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null
  return (
    <p
      role="alert"
      className="rounded-xl border border-perigo/20 bg-perigo-suave px-4 py-3 text-corpo leading-5 text-perigo-escuro"
    >
      {mensagem}
    </p>
  )
}

export function FormularioLogin({
  pessoa,
  cenario,
  aoEntrar,
}: {
  pessoa: PessoaExemplo
  cenario: CenarioEnvio
  aoEntrar: (pessoa: PessoaExemplo) => void
}) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const { enviando, enviar } = useEnvioVisual()
  function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!evento.currentTarget.reportValidity()) return
    setErro(null)
    enviar(() => {
      const mensagem = mensagemDoCenario(cenario)
      if (mensagem) {
        setErro(mensagem)
        return
      }
      setSenha('')
      aoEntrar({ nome: pessoa.nome, email: email.trim() })
    })
  }
  return (
    <form onSubmit={entrar} className="flex flex-col gap-5" aria-label="Entrar no protótipo">
      <Input
        rotulo="E-mail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="seu.email@empresa.com.br"
        autoComplete="off"
        required
        disabled={enviando}
        className="h-12!"
      />
      <Senha rotulo="Senha" valor={senha} aoMudar={setSenha} disabled={enviando} />
      <AvisoErro mensagem={erro} />
      <Button
        type="submit"
        carregando={enviando}
        icone={<ArrowRight size={18} aria-hidden="true" />}
        className="mt-1 h-12! w-full"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </Button>
      <Button
        variante="secundario"
        disabled={enviando}
        onClick={() => {
          setEmail(pessoa.email)
          setSenha(SENHA_EXEMPLO)
          setErro(null)
        }}
        className="w-full"
      >
        Preencher exemplo
      </Button>
      <p className="mt-2 text-center text-corpo text-ink-2">
        Primeiro acesso?{' '}
        <Link
          to="/dev/auth/cadastro"
          className="rounded-sm font-medium text-teal-profundo underline-offset-4 hover:underline"
        >
          Criar acesso com convite
        </Link>
      </p>
      <p className="text-center text-legenda leading-5 text-ink-2">
        Credenciais apenas ilustrativas. Use dados de exemplo nesta prévia.
      </p>
    </form>
  )
}

export function FormularioCadastro({
  cenario,
  aoCadastrar,
}: {
  cenario: CenarioEnvio
  aoCadastrar: (pessoa: PessoaExemplo) => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [convite, setConvite] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [erroSenha, setErroSenha] = useState<string | undefined>()
  const { enviando, enviar } = useEnvioVisual()
  function cadastrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!evento.currentTarget.reportValidity()) return
    setErro(null)
    setErroSenha(undefined)
    if (nome.trim().length < 2) {
      setErro('Informe seu nome para continuar.')
      return
    }
    if (senha !== confirmacao) {
      setErroSenha('As senhas precisam ser iguais.')
      return
    }
    if (convite.trim() !== CONVITE_EXEMPLO) {
      setErro('Convite não reconhecido. Use o código de demonstração informado.')
      return
    }
    enviar(() => {
      if (cenario === 'indisponivel') {
        setErro(mensagemDoCenario(cenario))
        return
      }
      if (cenario === 'invalido') {
        setErro('Já existe um acesso com este e-mail. Experimente entrar.')
        return
      }
      setSenha('')
      setConfirmacao('')
      setConvite('')
      aoCadastrar({ nome: nome.trim(), email: email.trim() })
    })
  }
  return (
    <form
      onSubmit={cadastrar}
      className="flex flex-col gap-4"
      aria-label="Criar acesso no protótipo"
    >
      <Input
        rotulo="Nome"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Como você gostaria de ser chamado?"
        required
        minLength={2}
        maxLength={120}
        disabled={enviando}
        autoComplete="off"
        className="h-12!"
      />
      <Input
        rotulo="E-mail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="seu.email@empresa.com.br"
        required
        disabled={enviando}
        autoComplete="off"
        className="h-12!"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Senha rotulo="Senha" valor={senha} aoMudar={setSenha} disabled={enviando} confirmar />
        <Senha
          rotulo="Confirmar senha"
          valor={confirmacao}
          aoMudar={(v) => {
            setConfirmacao(v)
            setErroSenha(undefined)
          }}
          disabled={enviando}
          confirmar
          erro={erroSenha}
        />
      </div>
      <p className="-mt-2 text-legenda text-ink-2">Mínimo de 8 caracteres nesta proposta.</p>
      <Input
        rotulo="Código de convite"
        value={convite}
        onChange={(e) => setConvite(e.target.value)}
        placeholder="Informe o convite recebido"
        required
        disabled={enviando}
        autoComplete="off"
        ajuda={`Código fictício para testar: ${CONVITE_EXEMPLO}`}
        className="h-12!"
      />
      <AvisoErro mensagem={erro} />
      <Button
        type="submit"
        carregando={enviando}
        icone={<KeyRound size={17} aria-hidden="true" />}
        className="mt-1 h-12! w-full"
      >
        {enviando ? 'Criando acesso…' : 'Criar acesso'}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/dev/auth/login"
          className="rounded-sm text-corpo text-teal-profundo hover:underline"
        >
          Já tenho acesso
        </Link>
        <button
          type="button"
          disabled={enviando}
          className="rounded-sm text-corpo text-ink-2 hover:text-teal-profundo disabled:opacity-50"
          onClick={() => {
            setNome(EXEMPLO.nome)
            setEmail(EXEMPLO.email)
            setSenha(SENHA_EXEMPLO)
            setConfirmacao(SENHA_EXEMPLO)
            setConvite(CONVITE_EXEMPLO)
            setErro(null)
            setErroSenha(undefined)
          }}
        >
          Preencher exemplo
        </button>
      </div>
    </form>
  )
}
