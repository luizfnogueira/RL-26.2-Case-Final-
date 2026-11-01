import { LayoutDashboard, KeyRound, LogIn, ShieldCheck } from 'lucide-react'

export default function EstruturaAuth() {
  return (
    <aside className="auth-story">
      <div className="auth-story-grid" aria-hidden="true" />
      <span className="auth-story-symbol">
        <ShieldCheck size={24} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="auth-story-heading">
        <p className="auth-eyebrow">V-Energy Grid 360</p>
        <h2>
          Uma visão completa.
          <br />
          <span>Um acesso simples.</span>
        </h2>
        <p>Informação para conectar receita, clientes e operação em uma única visão.</p>
      </div>
      <ol className="auth-journey" aria-label="Fluxo proposto">
        {[
          { icone: KeyRound, titulo: 'Primeiro acesso', texto: 'Cadastro com convite da equipe.' },
          { icone: LogIn, titulo: 'Entre na sua conta', texto: 'E-mail e senha para continuar.' },
          {
            icone: LayoutDashboard,
            titulo: 'Explore o portal',
            texto: 'Indicadores e análises em um só lugar.',
          },
        ].map((item) => (
          <li key={item.titulo}>
            <span className="auth-journey-icon">
              <item.icone size={17} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <p>{item.titulo}</p>
              <span>{item.texto}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="auth-story-footer">Informação para acompanhar o que importa.</p>
    </aside>
  )
}
