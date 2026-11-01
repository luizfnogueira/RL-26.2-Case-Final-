import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { ArrowRight, Check, Eye, EyeOff, Info } from 'lucide-react'
import { Link } from 'react-router'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { normalizarErro } from '@/services/erro-api'
import type { CadastroAuth } from '@/auth/api'
import { rotaAuth, type PessoaCadastro } from '@/auth/fluxo'

type Campos = 'nome' | 'email' | 'senha' | 'confirmacao' | 'convite'
type Erros = Partial<Record<Campos, string>>

function useFormularioVisual() {
  const formulario = useRef<HTMLFormElement>(null)
  const controle = useRef<AbortController | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erros, atualizarErros] = useState<Erros>({})
  const deveFocar = useRef(false)
  const [erro, setErro] = useState<string | null>(null)
  const aviso = useRef<HTMLDivElement>(null)
  useEffect(
    () => () => {
      controle.current?.abort()
    },
    [],
  )
  useEffect(() => {
    if (deveFocar.current) {
      formulario.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
      deveFocar.current = false
    }
  }, [erros])
  useEffect(() => {
    if (erro) aviso.current?.focus()
  }, [erro])
  function limpar(campo?: Campos) {
    setErro(null)
    if (campo)
      atualizarErros((anteriores) => {
        const novos = { ...anteriores }
        delete novos[campo]
        return novos
      })
    else atualizarErros({})
  }
  function setErros(novos: Erros) {
    deveFocar.current = true
    atualizarErros(novos)
  }
  async function enviar(concluir: (sinal: AbortSignal) => void | Promise<void>) {
    if (controle.current !== null) return
    const requisicao = new AbortController()
    controle.current = requisicao
    setEnviando(true)
    try {
      await concluir(requisicao.signal)
    } catch (erro) {
      if (!requisicao.signal.aborted) setErro(normalizarErro(erro).mensagem)
    } finally {
      if (!requisicao.signal.aborted) {
        controle.current = null
        setEnviando(false)
      }
    }
  }
  return { formulario, enviando, enviar, erros, setErros, erro, setErro, aviso, limpar }
}

function erroEmail(formulario: HTMLFormElement, email: string): string | undefined {
  if (!email.trim()) return 'Informe seu e-mail.'
  const campo = formulario.elements.namedItem('email') as HTMLInputElement
  if (campo.validity.typeMismatch) return 'Confira o formato do e-mail.'
  if (/@[^@]*\.test\.?$/i.test(email.trim()))
    return 'O domínio .test é reservado. Use seu e-mail ou, para testar, artur@example.com.'
}

function Senha({
  rotulo,
  name,
  valor,
  aoMudar,
  erro,
  cadastro = false,
  disabled,
}: {
  rotulo: string
  name: string
  valor: string
  aoMudar: (valor: string) => void
  erro?: string
  cadastro?: boolean
  disabled: boolean
}) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="auth-password">
      <Input
        rotulo={rotulo}
        name={name}
        type={visivel ? 'text' : 'password'}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete={cadastro ? 'new-password' : 'current-password'}
        maxLength={128}
        required
        disabled={disabled}
        erro={erro}
        className="auth-control auth-password-input"
      />
      <button
        type="button"
        aria-label={`${visivel ? 'Ocultar' : 'Mostrar'} ${rotulo.toLocaleLowerCase('pt-BR')}`}
        aria-pressed={visivel}
        disabled={disabled}
        onClick={() => setVisivel(!visivel)}
        className="auth-password-toggle"
      >
        {visivel ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </div>
  )
}

function AvisoErro({
  mensagem,
  referencia,
}: {
  mensagem: string | null
  referencia: RefObject<HTMLDivElement | null>
}) {
  if (!mensagem) return null
  return (
    <div ref={referencia} tabIndex={-1} role="alert" className="auth-error">
      <Info size={18} aria-hidden="true" />
      <p>{mensagem}</p>
    </div>
  )
}

export function FormularioLogin({
  emailInicial = '',
  destino,
  aoEntrar,
  autenticar,
}: {
  emailInicial?: string
  destino: string
  aoEntrar: (pessoa: PessoaCadastro) => void
  autenticar: (email: string, senha: string, sinal: AbortSignal) => Promise<PessoaCadastro>
}) {
  const [email, setEmail] = useState(emailInicial)
  const [senha, setSenha] = useState('')
  const {
    formulario,
    enviando,
    enviar,
    erros: errosCampos,
    setErros,
    erro,
    setErro,
    aviso,
    limpar,
  } = useFormularioVisual()
  function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const erros: Erros = {}
    const emailInvalido = erroEmail(evento.currentTarget, email)
    if (emailInvalido) erros.email = emailInvalido
    if (!senha) erros.senha = 'Informe sua senha.'
    setErro(null)
    setErros(erros)
    if (Object.keys(erros).length) return
    enviar(async (sinal) => {
      const usuario = await autenticar(email.trim(), senha, sinal)
      if (sinal.aborted) return
      setSenha('')
      aoEntrar(usuario)
    })
  }
  return (
    <form
      ref={formulario}
      noValidate
      onSubmit={entrar}
      className="auth-form"
      aria-label="Entrar"
      aria-busy={enviando}
    >
      <Input
        rotulo="E-mail"
        name="email"
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          limpar('email')
        }}
        placeholder="seu.email@empresa.com.br"
        autoComplete="username"
        maxLength={254}
        required
        disabled={enviando}
        erro={errosCampos.email}
        className="auth-control"
      />
      <Senha
        rotulo="Senha"
        name="senha"
        valor={senha}
        aoMudar={(v) => {
          setSenha(v)
          limpar('senha')
        }}
        disabled={enviando}
        erro={errosCampos.senha}
      />
      <AvisoErro mensagem={erro} referencia={aviso} />
      <Button type="submit" carregando={enviando} className="auth-primary">
        {enviando ? 'Entrando…' : 'Entrar'}
        <ArrowRight size={17} aria-hidden="true" />
      </Button>
      <p className="auth-form-switch">
        Primeiro acesso?{' '}
        <Link to={rotaAuth('cadastro', destino)}>
          Criar acesso <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </p>
      <details className="auth-help">
        <summary>Precisa de ajuda para acessar?</summary>
        <p>Confira seu e-mail e tente novamente. Se ainda não possui uma conta, crie seu acesso.</p>
      </details>
    </form>
  )
}

export function FormularioCadastro({
  destino,
  aoCadastrar,
  registrar,
}: {
  destino: string
  aoCadastrar: (pessoa: PessoaCadastro) => void
  registrar: (dados: CadastroAuth, sinal: AbortSignal) => Promise<PessoaCadastro>
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [convite, setConvite] = useState('')
  const {
    formulario,
    enviando,
    enviar,
    erros: errosCampos,
    setErros,
    erro,
    setErro,
    aviso,
    limpar,
  } = useFormularioVisual()
  function cadastrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const erros: Erros = {}
    if (nome.trim().length < 2) erros.nome = 'Informe seu nome com pelo menos 2 caracteres.'
    const emailInvalido = erroEmail(evento.currentTarget, email)
    if (emailInvalido) erros.email = emailInvalido
    if (senha.length < 8) erros.senha = 'Use pelo menos 8 caracteres.'
    if (!confirmacao) erros.confirmacao = 'Confirme sua senha.'
    else if (senha !== confirmacao) erros.confirmacao = 'As senhas precisam ser iguais.'
    if (!convite.trim()) erros.convite = 'Informe o código de convite recebido.'
    setErro(null)
    setErros(erros)
    if (Object.keys(erros).length) return
    enviar(async (sinal) => {
      const usuario = await registrar(
        { nome: nome.trim(), email: email.trim(), senha, convite: convite.trim() },
        sinal,
      )
      if (sinal.aborted) return
      setSenha('')
      setConfirmacao('')
      setConvite('')
      aoCadastrar(usuario)
    })
  }
  return (
    <form
      ref={formulario}
      noValidate
      onSubmit={cadastrar}
      className="auth-form auth-form-registration"
      aria-label="Criar acesso"
      aria-busy={enviando}
    >
      <Input
        rotulo="Nome"
        name="nome"
        value={nome}
        onChange={(e) => {
          setNome(e.target.value)
          limpar('nome')
        }}
        placeholder="Como você gostaria de ser chamado?"
        required
        maxLength={120}
        disabled={enviando}
        autoComplete="name"
        erro={errosCampos.nome}
        className="auth-control"
      />
      <Input
        rotulo="E-mail"
        name="email"
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          limpar('email')
        }}
        placeholder="seu.email@empresa.com.br"
        required
        disabled={enviando}
        autoComplete="email"
        maxLength={254}
        erro={errosCampos.email}
        className="auth-control"
      />
      <div className="auth-passwords">
        <Senha
          rotulo="Senha"
          name="senha"
          valor={senha}
          aoMudar={(v) => {
            setSenha(v)
            limpar('senha')
          }}
          disabled={enviando}
          cadastro
          erro={errosCampos.senha}
        />
        <Senha
          rotulo="Confirmar senha"
          name="confirmacao"
          valor={confirmacao}
          aoMudar={(v) => {
            setConfirmacao(v)
            limpar('confirmacao')
          }}
          disabled={enviando}
          cadastro
          erro={errosCampos.confirmacao}
        />
      </div>
      <ul className="auth-password-rules" aria-label="Conferência da senha">
        <li className={senha.length >= 8 ? 'auth-rule-met' : ''}>
          <Check size={13} aria-hidden="true" />
          Pelo menos 8 caracteres
        </li>
        <li className={confirmacao && confirmacao === senha ? 'auth-rule-met' : ''}>
          <Check size={13} aria-hidden="true" />
          Confirmação igual à senha
        </li>
      </ul>
      <Input
        rotulo="Código de convite"
        name="convite"
        value={convite}
        onChange={(e) => {
          setConvite(e.target.value)
          limpar('convite')
        }}
        placeholder="Informe o convite recebido"
        ajuda="Use o convite recebido da equipe."
        autoComplete="off"
        spellCheck={false}
        maxLength={128}
        required
        disabled={enviando}
        erro={errosCampos.convite}
        className="auth-control"
      />
      <AvisoErro mensagem={erro} referencia={aviso} />
      <Button type="submit" carregando={enviando} className="auth-primary">
        {enviando ? 'Criando acesso…' : 'Criar acesso'}
        <ArrowRight size={17} aria-hidden="true" />
      </Button>
      <p className="auth-form-switch">
        Já possui uma conta?{' '}
        <Link to={rotaAuth('login', destino)}>
          Entrar no portal <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </p>
    </form>
  )
}
