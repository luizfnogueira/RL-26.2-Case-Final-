import { ArrowRight, Check, CircleCheck, Clock3, LogIn, LogOut } from 'lucide-react'
import { Link } from 'react-router'
import Button from '@/components/ui/Button'
import { nomeDoDestino, rotaDaPrevia, type EtapaAuth, type PessoaExemplo } from './fluxo'

export default function EstadosAuth({
  etapa,
  pessoa,
  destino,
  aoNavegar,
  aoSair,
  integrada = false,
}: {
  etapa: EtapaAuth
  pessoa: PessoaExemplo
  destino: string
  aoNavegar: (etapa: EtapaAuth) => void
  aoSair: () => void
  integrada?: boolean
}) {
  if (etapa === 'confirmacao')
    return (
      <div className="auth-state">
        <span className="auth-state-icon auth-state-success">
          <CircleCheck size={29} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="auth-account-summary">
          <span className="auth-detail-label">
            {integrada ? 'Conta criada' : 'Seu acesso de exemplo'}
          </span>
          <p>{pessoa.nome}</p>
          <span className="auth-account-email">{pessoa.email}</span>
        </div>
        <p className="auth-state-text">
          Agora você pode entrar com seu e-mail e senha para acessar o portal.
        </p>
        <Button onClick={() => aoNavegar('login')} className="auth-primary">
          Ir para login
          <ArrowRight size={17} aria-hidden="true" />
        </Button>
        <Link to={rotaDaPrevia('cadastro', destino)} className="auth-secondary-link">
          Rever cadastro
        </Link>
      </div>
    )
  if (etapa === 'sessao')
    return (
      <div className="auth-state">
        <div className="auth-session-person">
          <span className="auth-avatar">{pessoa.nome.charAt(0).toLocaleUpperCase('pt-BR')}</span>
          <div>
            <p>Olá, {pessoa.nome}.</p>
            <span>{pessoa.email}</span>
          </div>
          <Check size={18} aria-hidden="true" />
        </div>
        <div className="auth-session-details">
          <p>
            <span>Situação</span>
            <strong>
              <i />
              {integrada ? 'Sessão autenticada' : 'Sessão de exemplo'}
            </strong>
          </p>
          <p>
            <span>{integrada ? 'Validade máxima do token' : 'Duração proposta'}</span>
            <strong>60 minutos</strong>
          </p>
          <p>
            <span>Seu destino</span>
            <strong>{nomeDoDestino(destino)}</strong>
          </p>
        </div>
        <Link to={destino} className="auth-primary auth-primary-link">
          {destino === '/painel'
            ? 'Visualizar Painel Executivo'
            : `Continuar para ${nomeDoDestino(destino)}`}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
        {!integrada && (
          <Button
            variante="fantasma"
            onClick={() => aoNavegar('expirada')}
            className="auth-secondary-action"
            icone={<Clock3 size={16} aria-hidden="true" />}
          >
            Simular sessão expirada
          </Button>
        )}
        <Button
          variante="fantasma"
          onClick={aoSair}
          className="auth-secondary-action"
          icone={<LogOut size={16} aria-hidden="true" />}
        >
          {integrada ? 'Sair da conta' : 'Sair da demonstração'}
        </Button>
      </div>
    )
  return (
    <div className="auth-state">
      <span className="auth-state-icon auth-state-warning">
        <Clock3 size={28} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="auth-expiration-note">
        <p>Seu próximo destino está salvo.</p>
        <span>{nomeDoDestino(destino)}</span>
        <p>
          Confirme seu e-mail e senha para continuar. Depois de entrar, você poderá retomar este
          recorte.
        </p>
      </div>
      <Button
        onClick={() => aoNavegar('login')}
        className="auth-primary"
        icone={<LogIn size={17} aria-hidden="true" />}
      >
        Entrar novamente
      </Button>
      <Link to={destino} className="auth-secondary-link">
        Voltar à prévia do portal
      </Link>
    </div>
  )
}
