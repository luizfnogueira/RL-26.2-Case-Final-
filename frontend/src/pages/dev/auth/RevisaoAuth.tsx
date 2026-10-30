import { useState } from 'react'
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { NavLink } from 'react-router'
import Select from '@/components/ui/Select'
import { cx } from '@/utils/cx'
import { rotaDaPrevia, type CenarioEnvio, type EtapaAuth } from './fluxo'

export default function RevisaoAuth({
  etapa,
  destino,
  cenario,
  aoMudarCenario,
  aoReiniciar,
}: {
  etapa: EtapaAuth
  destino: string
  cenario: CenarioEnvio
  aoMudarCenario: (v: CenarioEnvio) => void
  aoReiniciar: () => void
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <section className="auth-review" aria-label="Revisão do protótipo">
      <button
        className="auth-review-toggle"
        type="button"
        aria-expanded={aberto}
        aria-controls="revisao-auth"
        onClick={() => setAberto(!aberto)}
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
        Revisar fluxo
        <ChevronDown size={15} className={aberto ? 'rotate-180' : ''} aria-hidden="true" />
      </button>
      <div id="revisao-auth" hidden={!aberto} className="auth-review-content">
        <div className="auth-review-heading">
          <div>
            <h2>Estados para discussão</h2>
            <p>Escolha uma tela ou simule uma resposta ao enviar o formulário.</p>
          </div>
          <button type="button" onClick={aoReiniciar} className="auth-review-reset">
            <RotateCcw size={14} aria-hidden="true" />
            Reiniciar prévia
          </button>
        </div>
        <nav aria-label="Telas do protótipo" className="auth-review-nav">
          {(
            [
              ['login', 'Login'],
              ['cadastro', 'Cadastro'],
              ['confirmacao', 'Confirmação'],
              ['sessao', 'Sessão'],
              ['expirada', 'Expirada'],
            ] as const
          ).map(([valor, rotulo]) => (
            <NavLink
              key={valor}
              to={rotaDaPrevia(valor, destino)}
              className={({ isActive }) => cx(isActive && 'auth-review-active')}
            >
              {rotulo}
            </NavLink>
          ))}
        </nav>
        {(etapa === 'login' || etapa === 'cadastro') && (
          <Select
            rotulo="Resultado simulado"
            valor={cenario}
            aoMudar={(v) => aoMudarCenario(v as CenarioEnvio)}
            opcoes={[
              { valor: 'normal', rotulo: 'Sucesso' },
              {
                valor: 'invalido',
                rotulo: etapa === 'login' ? 'Credenciais inválidas' : 'E-mail já cadastrado',
              },
              { valor: 'indisponivel', rotulo: 'Serviço indisponível' },
            ]}
          />
        )}
        <p className="auth-review-note">
          Sem criação de contas, emissão de token ou chamadas à API. O fluxo continua em revisão.
        </p>
      </div>
    </section>
  )
}
