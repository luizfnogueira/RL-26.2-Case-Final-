import { useEffect, useRef } from 'react'
import { ArrowLeft, LogOut } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router'
import Logo from '@/components/common/Logo'
import BotaoTema from '@/theme/BotaoTema'
import { tokenStorage } from '@/auth/tokenStorage'
import { useRetornoAoLogin } from '@/auth/useRetornoAoLogin'
import { cadastrarNaApi, entrarNaApi } from '@/auth/api'
import { destinoSeguro, rotaAuth, type EtapaAuth } from '@/auth/fluxo'
import EstruturaAuth from './EstruturaAuth'
import { FormularioCadastro, FormularioLogin } from './FormulariosAuth'
import './auth.css'

const TITULOS = {
  login: ['Bem-vindo de volta', 'Acesse sua conta e encontre uma visão completa do negócio.'],
  cadastro: ['Crie seu acesso', 'Use seu convite para começar a explorar o portal.'],
} as const

export default function AuthPage({ etapa }: { etapa: EtapaAuth }) {
  const [params] = useSearchParams()
  const localizacao = useLocation()
  const navegar = useNavigate()
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const destino = destinoSeguro(params.get('destino'))
  const temToken = Boolean(tokenStorage.get())
  const emailCadastrado = localizacao.state?.emailCadastrado
  const emailInicial = typeof emailCadastrado === 'string' ? emailCadastrado : ''
  useRetornoAoLogin(destino)
  useEffect(() => {
    document.title = `${etapa === 'login' ? 'Login' : 'Cadastro'} · V-Energy Grid 360`
    tituloRef.current?.focus({ preventScroll: true })
  }, [etapa])
  const [titulo, subtitulo] = TITULOS[etapa]
  return (
    <main className="auth-page">
      <div className="auth-container">
        <header className="auth-header">
          <Link to={rotaAuth('login', destino)} aria-label="V-Energy Grid 360">
            <Logo />
          </Link>
          <div className="auth-header-actions">
            <BotaoTema compacto />
            {temToken && (
              <>
                <button
                  type="button"
                  className="auth-back"
                  onClick={() => {
                    tokenStorage.clear()
                    navegar(rotaAuth('login', destino), { replace: true, state: null })
                  }}
                >
                  <LogOut size={16} aria-hidden="true" /> Sair da conta
                </button>
                <Link to={destino} className="auth-back">
                  <ArrowLeft size={16} aria-hidden="true" /> Voltar ao portal
                </Link>
              </>
            )}
          </div>
        </header>
        <div className="auth-toolbar">
          <nav className="auth-tabs" aria-label="Acesso à conta">
            <NavLink to={rotaAuth('login', destino)} aria-label="Acessar login">
              Login
            </NavLink>
            <NavLink to={rotaAuth('cadastro', destino)} aria-label="Acessar cadastro">
              Cadastro
            </NavLink>
          </nav>
        </div>
        <div className="auth-stage">
          <EstruturaAuth />
          <section className="auth-form-panel" aria-labelledby="titulo-auth">
            <div className="auth-form-content">
              <p className="auth-form-eyebrow">
                {etapa === 'cadastro' ? 'Primeiro acesso' : 'Acesso ao portal'}
              </p>
              <h1 ref={tituloRef} tabIndex={-1} id="titulo-auth">
                {titulo}
              </h1>
              <p className="auth-form-intro">{subtitulo}</p>
              {etapa === 'login' ? (
                <>
                  {emailInicial && (
                    <p role="status" className="auth-success">
                      Conta criada. Entre com seu e-mail e senha.
                    </p>
                  )}
                  {localizacao.state?.sessaoExpirada && (
                    <p role="status" className="auth-success">
                      Sua sessão expirou. Entre novamente para continuar.
                    </p>
                  )}
                  <FormularioLogin
                    key={emailInicial}
                    emailInicial={emailInicial}
                    destino={destino}
                    aoEntrar={() => navegar(destino, { replace: true })}
                    autenticar={entrarNaApi}
                  />
                </>
              ) : (
                <FormularioCadastro
                  destino={destino}
                  aoCadastrar={(usuario) =>
                    navegar(rotaAuth('login', destino), {
                      replace: true,
                      state: { emailCadastrado: usuario.email },
                    })
                  }
                  registrar={cadastrarNaApi}
                />
              )}
            </div>
            <p className="auth-panel-footer">
              V-Energy Grid 360 <span>Uma experiência conectada.</span>
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
