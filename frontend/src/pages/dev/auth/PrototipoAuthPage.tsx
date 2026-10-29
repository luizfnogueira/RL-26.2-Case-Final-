import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, CircleDot } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import Logo from '@/components/common/Logo'
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
  cadastro: ['Crie seu acesso', 'Informe seus dados e o convite recebido para começar.'],
  confirmacao: ['Seu acesso está pronto', 'Falta só entrar para começar.'],
  sessao: ['Você está no portal', 'Tudo pronto para continuar sua análise.'],
  expirada: ['Sua sessão expirou', 'Entre novamente para retomar sua análise.'],
} as const

/** Prévia de desenvolvimento. Não persiste credenciais nem implementa AUTH-f. */
export default function PrototipoAuthPage() {
  const { etapa } = useParams()
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const [pessoa, setPessoa] = useState<PessoaExemplo>(EXEMPLO)
  const [reinicio, setReinicio] = useState(0)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const destino = destinoSeguro(params.get('destino'))
  const valorCenario = params.get('cenario')
  const cenario: CenarioEnvio =
    valorCenario === 'invalido' || valorCenario === 'indisponivel' ? valorCenario : 'normal'
  useEffect(() => {
    document.title = 'Prévia de autenticação · V-Energy Grid 360'
    tituloRef.current?.focus({ preventScroll: true })
  }, [etapa])
  if (!etapaValida(etapa)) return <Navigate to={rotaDaPrevia('login', destino)} replace />
  const [titulo, subtitulo] = TITULOS[etapa]
  const ir = (proxima: EtapaAuth) => navegar(rotaDaPrevia(proxima, destino))
  function concluir(p: PessoaExemplo, proxima: EtapaAuth) {
    setPessoa(p)
    ir(proxima)
  }
  function reiniciar() {
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
                <FormularioLogin
                  key={`login-${reinicio}`}
                  pessoa={pessoa}
                  cenario={cenario}
                  destino={destino}
                  aoEntrar={(p) => concluir(p, 'sessao')}
                />
              )}
              {etapa === 'cadastro' && (
                <FormularioCadastro
                  key={`cadastro-${reinicio}`}
                  pessoa={pessoa}
                  cenario={cenario}
                  destino={destino}
                  aoCadastrar={(p) => concluir(p, 'confirmacao')}
                />
              )}
              {etapa !== 'login' && etapa !== 'cadastro' && (
                <EstadosAuth
                  etapa={etapa}
                  pessoa={pessoa}
                  destino={destino}
                  aoNavegar={ir}
                  aoSair={reiniciar}
                />
              )}
            </div>
            <p className="auth-panel-footer">
              V-Energy Grid 360 <span>Uma experiência conectada.</span>
            </p>
          </section>
        </div>
        <footer className="auth-preview-footer">
          <p>
            <span className="auth-preview-badge">Esboço para discussão</span>Nenhuma conta ou sessão
            real é criada.
          </p>
          <span>Fluxo em revisão · prévia local</span>
        </footer>
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
      </div>
    </main>
  )
}
