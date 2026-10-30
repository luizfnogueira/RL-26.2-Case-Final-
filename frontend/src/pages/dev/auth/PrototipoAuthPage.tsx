import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, CircleDot } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import Logo from '@/components/common/Logo'
import ErrorState from '@/components/ui/ErrorState'
import { tokenStorage } from '@/auth/tokenStorage'
import { aoNaoAutorizado } from '@/auth/naoAutorizado'
import { useConsulta } from '@/hooks/useConsulta'
import { AUTH_PREVIEW_API, cadastrarNaApi, consultarSessao, entrarNaApi } from './api'
import EstruturaAuth from './EstruturaAuth'
import EstadosAuth from './EstadosAuth'
import { FormularioCadastro, FormularioLogin } from './FormulariosAuth'
import RevisaoAuth from './RevisaoAuth'
import {
  destinoSeguro,
  etapaValida,
  EXEMPLO,
  rotaDaPrevia,
  type CenarioEnvio,
  type EtapaAuth,
  type PessoaExemplo,
} from './fluxo'
import './auth-preview.css'

const TITULOS = {
  login: ['Bem-vindo de volta', 'Acesse sua conta e encontre uma visão completa do negócio.'],
  cadastro: ['Crie seu acesso', 'Informe seus dados para criar sua conta.'],
  confirmacao: ['Seu acesso está pronto', 'Falta só entrar para começar.'],
  sessao: ['Você está no portal', 'Tudo pronto para continuar sua análise.'],
  expirada: ['Sua sessão expirou', 'Entre novamente para retomar sua análise.'],
} as const

/** Prévia de desenvolvimento de AUTH-b, com integração real opt-in para validar o backend. */
export default function PrototipoAuthPage() {
  const { etapa } = useParams()
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const [pessoa, setPessoa] = useState<PessoaExemplo>(EXEMPLO)
  const [reinicio, setReinicio] = useState(0)
  const [expirou, setExpirou] = useState(false)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const destino = destinoSeguro(params.get('destino'))
  const token = AUTH_PREVIEW_API ? tokenStorage.get() : null
  const temToken = Boolean(token)
  const sessao = useConsulta(consultarSessao, [etapa, token], {
    habilitada: AUTH_PREVIEW_API && etapa === 'sessao' && temToken,
  })
  useEffect(() => {
    if (!AUTH_PREVIEW_API) return
    return aoNaoAutorizado(() => {
      setExpirou(true)
      setPessoa(EXEMPLO)
      navegar(rotaDaPrevia('expirada', destino), { replace: true })
    })
  }, [navegar, destino])
  const valorCenario = params.get('cenario')
  const cenario: CenarioEnvio =
    valorCenario === 'invalido' || valorCenario === 'indisponivel' ? valorCenario : 'normal'
  useEffect(() => {
    document.title = 'Prévia de autenticação · V-Energy Grid 360'
    tituloRef.current?.focus({ preventScroll: true })
  }, [etapa])
  if (!etapaValida(etapa)) return <Navigate to={rotaDaPrevia('login', destino)} replace />
  if (AUTH_PREVIEW_API && etapa === 'sessao' && !temToken)
    return <Navigate to={rotaDaPrevia(expirou ? 'expirada' : 'login', destino)} replace />
  if (AUTH_PREVIEW_API && etapa === 'confirmacao' && pessoa === EXEMPLO)
    return <Navigate to={rotaDaPrevia('login', destino)} replace />
  const [titulo, subtitulo] = TITULOS[etapa]
  const ir = (proxima: EtapaAuth) => navegar(rotaDaPrevia(proxima, destino))
  function concluir(p: PessoaExemplo, proxima: EtapaAuth) {
    setExpirou(false)
    setPessoa(p)
    ir(proxima)
  }
  function reiniciar() {
    setExpirou(false)
    if (AUTH_PREVIEW_API) tokenStorage.clear()
    setPessoa(EXEMPLO)
    setReinicio((valor) => valor + 1)
    ir('login')
  }
  return (
    <main className="auth-preview">
      <div className="auth-container">
        <header className="auth-header">
          <Link
            to={rotaDaPrevia('login', destino)}
            aria-label="V-Energy Grid 360: prévia de acesso"
          >
            <Logo />
          </Link>
          <Link to={destino} className="auth-back">
            Voltar ao portal
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </header>
        <div className="auth-stage">
          <EstruturaAuth etapa={etapa} />
          <section className="auth-form-panel" aria-labelledby="titulo-auth">
            <div className="auth-form-content">
              <p className="auth-form-eyebrow">
                <CircleDot size={13} aria-hidden="true" />
                {etapa === 'cadastro'
                  ? 'Primeiro acesso'
                  : etapa === 'confirmacao'
                    ? 'Cadastro concluído'
                    : etapa === 'expirada'
                      ? 'Retome sua análise'
                      : 'Acesso ao portal'}
              </p>
              <h1 ref={tituloRef} tabIndex={-1} id="titulo-auth">
                {titulo}
              </h1>
              <p className="auth-form-intro">{subtitulo}</p>
              {etapa === 'login' && (
                <>
                  {temToken && (
                    <Link to={rotaDaPrevia('sessao', destino)} className="auth-secondary-link">
                      Retomar sessão existente
                    </Link>
                  )}
                  <FormularioLogin
                    key={`login-${reinicio}`}
                    pessoa={pessoa}
                    cenario={cenario}
                    destino={destino}
                    aoEntrar={(p) => concluir(p, 'sessao')}
                    autenticar={AUTH_PREVIEW_API ? entrarNaApi : undefined}
                  />
                </>
              )}
              {etapa === 'cadastro' && (
                <FormularioCadastro
                  key={`cadastro-${reinicio}`}
                  pessoa={pessoa}
                  cenario={cenario}
                  destino={destino}
                  aoCadastrar={(p) => concluir(p, 'confirmacao')}
                  registrar={AUTH_PREVIEW_API ? cadastrarNaApi : undefined}
                />
              )}
              {etapa !== 'login' &&
                etapa !== 'cadastro' &&
                (AUTH_PREVIEW_API && etapa === 'sessao' && sessao.carregando ? (
                  <p role="status" aria-busy="true">
                    Conferindo sua sessão…
                  </p>
                ) : AUTH_PREVIEW_API && etapa === 'sessao' && sessao.erro ? (
                  <ErrorState erro={sessao.erro} aoTentarNovamente={sessao.recarregar} />
                ) : (
                  <EstadosAuth
                    etapa={etapa}
                    pessoa={
                      AUTH_PREVIEW_API && etapa === 'sessao' ? (sessao.dados ?? pessoa) : pessoa
                    }
                    destino={destino}
                    aoNavegar={ir}
                    aoSair={reiniciar}
                    integrada={AUTH_PREVIEW_API}
                  />
                ))}
            </div>
            <p className="auth-panel-footer">
              V-Energy Grid 360 <span>Uma experiência conectada.</span>
            </p>
          </section>
        </div>
        <footer className="auth-preview-footer">
          <p>
            <span className="auth-preview-badge">
              {AUTH_PREVIEW_API ? 'Teste integrado de autenticação' : 'Esboço para discussão'}
            </span>
            {AUTH_PREVIEW_API
              ? 'Cadastro e login conectados à API local.'
              : 'Nenhuma conta ou sessão real é criada.'}
          </p>
          <span>Fluxo em revisão · prévia local</span>
        </footer>
        {!AUTH_PREVIEW_API && (
          <RevisaoAuth
            etapa={etapa}
            destino={destino}
            cenario={cenario}
            aoReiniciar={reiniciar}
            aoMudarCenario={(valor) =>
              setParams(
                (atuais) => {
                  const novos = new URLSearchParams(atuais)
                  if (valor === 'normal') novos.delete('cenario')
                  else novos.set('cenario', valor)
                  return novos
                },
                { replace: true },
              )
            }
          />
        )}
      </div>
    </main>
  )
}
