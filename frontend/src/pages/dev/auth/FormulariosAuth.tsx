import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { ArrowRight, Check, Eye, EyeOff, Info } from 'lucide-react'
import { Link } from 'react-router'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  CONVITE_EXEMPLO,
  EXEMPLO,
  mensagemDoCenario,
  rotaDaPrevia,
  SENHA_EXEMPLO,
  type CenarioEnvio,
  type PessoaExemplo,
} from './fluxo'

type Campos = 'nome' | 'email' | 'senha' | 'confirmacao' | 'convite'
type Erros = Partial<Record<Campos, string>>

function useFormularioVisual() {
  const formulario = useRef<HTMLFormElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erros, atualizarErros] = useState<Erros>({})
  const deveFocar = useRef(false)
  const [erro, setErro] = useState<string | null>(null)
  const aviso = useRef<HTMLDivElement>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
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
  return { formulario, enviando, enviar, erros, setErros, erro, setErro, aviso, limpar }
}

function erroEmail(formulario: HTMLFormElement, email: string): string | undefined {
  if (!email.trim()) return 'Informe seu e-mail.'
  const campo = formulario.elements.namedItem('email') as HTMLInputElement
  if (campo.validity.typeMismatch) return 'Confira o formato do e-mail.'
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
  pessoa,
  cenario,
  destino,
  aoEntrar,
}: {
  pessoa: PessoaExemplo
  cenario: CenarioEnvio
  destino: string
  aoEntrar: (pessoa: PessoaExemplo) => void
}) {
  const [email, setEmail] = useState(pessoa === EXEMPLO ? '' : pessoa.email)
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
    <form
      ref={formulario}
      noValidate
      onSubmit={entrar}
      className="auth-form"
      aria-label="Entrar no protótipo"
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
        <Link to={rotaDaPrevia('cadastro', destino)}>
          Criar acesso com convite <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </p>
      <div className="auth-form-bottom">
        <button
          type="button"
          disabled={enviando}
          className="auth-example"
          onClick={() => {
            setEmail(pessoa.email)
            setSenha(SENHA_EXEMPLO)
            limpar()
          }}
        >
          Preencher exemplo
        </button>
        <span>Use somente dados fictícios</span>
      </div>
      <details className="auth-help">
        <summary>Precisa de ajuda para acessar?</summary>
        <p>
          Confira seu e-mail e tente novamente. Se ainda não tem um convite, solicite o acesso à
          pessoa responsável na equipe.
        </p>
      </details>
    </form>
  )
}

export function FormularioCadastro({
  pessoa,
  cenario,
  destino,
  aoCadastrar,
}: {
  pessoa: PessoaExemplo
  cenario: CenarioEnvio
  destino: string
  aoCadastrar: (pessoa: PessoaExemplo) => void
}) {
  const [nome, setNome] = useState(pessoa === EXEMPLO ? '' : pessoa.nome)
  const [email, setEmail] = useState(pessoa === EXEMPLO ? '' : pessoa.email)
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
    if (!convite.trim()) erros.convite = 'Informe o código de convite.'
    else if (convite.trim() !== CONVITE_EXEMPLO)
      erros.convite = 'Convite não reconhecido. Confira o código recebido.'
    setErro(null)
    setErros(erros)
    if (Object.keys(erros).length) return
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
      ref={formulario}
      noValidate
      onSubmit={cadastrar}
      className="auth-form auth-form-registration"
      aria-label="Criar acesso no protótipo"
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
        placeholder="Seu nome completo"
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
        placeholder="Código recebido pela equipe"
        required
        disabled={enviando}
        autoComplete="off"
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
        <Link to={rotaDaPrevia('login', destino)}>
          Entrar no portal <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </p>
      <div className="auth-form-bottom">
        <button
          type="button"
          disabled={enviando}
          className="auth-example"
          onClick={() => {
            setNome(EXEMPLO.nome)
            setEmail(EXEMPLO.email)
            setSenha(SENHA_EXEMPLO)
            setConfirmacao(SENHA_EXEMPLO)
            setConvite(CONVITE_EXEMPLO)
            limpar()
          }}
        >
          Preencher exemplo
        </button>
        <span>Use somente dados fictícios</span>
      </div>
    </form>
  )
}
