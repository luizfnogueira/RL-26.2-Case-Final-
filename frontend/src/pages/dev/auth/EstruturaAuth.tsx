import {
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  KeyRound,
  Layers3,
  LogIn,
  Zap,
} from 'lucide-react'
import { cx } from '@/utils/cx'
import type { EtapaAuth } from './fluxo'

export default function EstruturaAuth({ etapa }: { etapa: EtapaAuth }) {
  const passo = etapa === 'cadastro' || etapa === 'confirmacao' ? 0 : etapa === 'sessao' ? 2 : 1
  return (
    <aside className="auth-story">
      <div className="auth-story-grid" aria-hidden="true" />
      <div className="auth-story-top">
        <span className="auth-story-symbol">
          <Zap size={21} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span>Conectando decisões.</span>
        <span className="auth-story-dot" />
      </div>
      <div className="auth-story-heading">
        <p className="auth-eyebrow">Inteligência para o negócio</p>
        <h2>
          Uma visão completa.
          <br />
          <span>Decisões conectadas.</span>
        </h2>
        <p>
          Receita, clientes e operação.
          <br />
          Tudo se encontra na sua visão 360.
        </p>
      </div>
      <div className="auth-network" aria-hidden="true">
        <svg viewBox="0 0 300 102" fill="none">
          <path d="M25 73H80L105 29H174L201 73H275" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M25 73H80L105 29H174L201 73H275"
            stroke="var(--color-lima)"
            strokeWidth="2"
            strokeDasharray="42 260"
          />
          <circle cx="25" cy="73" r="5" />
          <circle cx="105" cy="29" r="5" />
          <circle cx="174" cy="29" r="5" />
          <circle cx="275" cy="73" r="5" />
        </svg>
        <div className="auth-network-labels">
          <span>
            <ChartNoAxesCombined size={13} />
            Receita
          </span>
          <span>
            <Layers3 size={13} />
            Clientes
          </span>
          <span>
            <Zap size={13} />
            Operação
          </span>
        </div>
      </div>
      <ol className="auth-journey" aria-label="Fluxo proposto">
        {[
          { icone: KeyRound, titulo: 'Primeiro acesso', texto: 'Crie sua conta com um convite.' },
          { icone: LogIn, titulo: 'Entre no portal', texto: 'Acesse com seu e-mail e senha.' },
          { icone: ArrowUpRight, titulo: 'Sua visão 360', texto: 'Continue de onde você parou.' },
        ].map((item, i) => (
          <li
            key={item.titulo}
            className={cx(passo === i && 'auth-journey-current')}
            aria-current={passo === i ? 'step' : undefined}
          >
            <span className="auth-journey-icon">
              <item.icone size={17} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <p>{item.titulo}</p>
              <span>{item.texto}</span>
            </div>
            {passo > i && <Check size={14} className="auth-journey-check" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p className="auth-story-footer">
        V-Energy <span>Grid 360</span>
      </p>
    </aside>
  )
}
