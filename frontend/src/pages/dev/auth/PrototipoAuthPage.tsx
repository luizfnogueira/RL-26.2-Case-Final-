import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Clock3,
  KeyRound,
  LogIn,
  LogOut,
  PanelsTopLeft,
  ShieldCheck,
} from 'lucide-react'
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router'
import Logo from '@/components/common/Logo'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { cx } from '@/utils/cx'
import { FormularioCadastro, FormularioLogin } from './FormulariosAuth'
import { etapaValida, EXEMPLO, type CenarioEnvio, type EtapaAuth } from './fluxo'

const TELAS: { etapa: EtapaAuth; rotulo: string }[] = [
  { etapa: 'login', rotulo: 'Login' },
  { etapa: 'cadastro', rotulo: 'Cadastro' },
  { etapa: 'confirmacao', rotulo: 'Confirmação' },
  { etapa: 'sessao', rotulo: 'Sessão' },
  { etapa: 'expirada', rotulo: 'Expirada' },
]
const TITULOS = {
  login: ['Bem-vindo de volta', 'Entre para acompanhar os resultados da V-Energy.'],
  cadastro: ['Crie seu acesso', 'Use seu convite para começar a explorar o portal.'],
  confirmacao: ['Seu acesso está pronto', 'O próximo passo é entrar com seu e-mail e senha.'],
  sessao: ['Você está no portal', 'Uma prévia do que acontece depois de entrar.'],
  expirada: ['Sua sessão expirou', 'Entre novamente para continuar de onde parou.'],
} as const

/** Esboço deliberadamente isolado: não usa tokenStorage, /auth ou ProtectedRoute. */
export default function PrototipoAuthPage() {
  const { etapa } = useParams()
  const navegar = useNavigate()
  const [pessoa, setPessoa] = useState(EXEMPLO)
  const [cenario, setCenario] = useState<CenarioEnvio>('normal')
  useEffect(() => {
    document.title = 'Prévia de autenticação · V-Energy Grid 360'
  }, [])
  if (!etapaValida(etapa)) return <Navigate to="/dev/auth/login" replace />
  const [titulo, subtitulo] = TITULOS[etapa]
  const passo = etapa === 'cadastro' || etapa === 'confirmacao' ? 0 : etapa === 'sessao' ? 2 : 1
  return (
    <main className="min-h-dvh bg-filo px-4 py-5 font-sans text-ink sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link to="/dev/auth/login" aria-label="V-Energy Grid 360: prévia de acesso">
            <Logo />
          </Link>
          <Link
            to="/painel"
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/60 px-4 py-2 text-corpo text-teal-profundo hover:bg-white"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar ao portal
          </Link>
        </header>
        <section
          aria-label="Controles da prévia"
          className="mb-5 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex flex-col gap-2">
            <div>
              <Badge variante="alerta">Esboço para discussão</Badge>
            </div>
            <p className="text-legenda text-ink-2">
              Nenhuma conta ou sessão real é criada. O portal continua com acesso livre.
            </p>
          </div>
          <nav
            aria-label="Telas do protótipo"
            className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/80 bg-white/60 p-1"
          >
            {TELAS.map((tela) => (
              <NavLink
                key={tela.etapa}
                to={`/dev/auth/${tela.etapa}`}
                className={({ isActive }) =>
                  cx(
                    'rounded-full px-3 py-2 text-legenda whitespace-nowrap',
                    isActive ? 'bg-surface-escuro text-white' : 'text-ink-2 hover:bg-white',
                  )
                }
              >
                {tela.rotulo}
              </NavLink>
            ))}
          </nav>
        </section>
        <div className="grid overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_20px_70px_-30px_#36465f55] lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="relative hidden min-h-[630px] flex-col justify-between overflow-hidden bg-surface-escuro p-10 text-white lg:flex xl:p-12">
            <div
              className="pointer-events-none absolute -top-32 -right-44 size-[440px] rounded-full border border-white/10"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -top-14 -right-28 size-[300px] rounded-full border border-white/10"
              aria-hidden="true"
            />
            <div className="relative">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-lima text-surface-escuro">
                <ShieldCheck size={25} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <p className="mt-8 text-legenda uppercase tracking-[0.2em] text-azul-300">
                V-Energy Grid 360
              </p>
              <h2 className="mt-4 text-[38px] leading-[1.15] font-light tracking-tight">
                Uma visão completa.
                <br />
                <span className="text-lima">Um acesso simples.</span>
              </h2>
              <p className="mt-5 max-w-xs text-corpo-lg leading-6 text-azul-100">
                Informação para conectar receita, clientes e operação em uma única visão.
              </p>
            </div>
            <ol className="relative mt-12 flex flex-col gap-5" aria-label="Fluxo proposto">
              {[
                {
                  icone: KeyRound,
                  titulo: 'Primeiro acesso',
                  texto: 'Cadastro com convite da equipe.',
                },
                {
                  icone: LogIn,
                  titulo: 'Entre na sua conta',
                  texto: 'E-mail e senha para continuar.',
                },
                {
                  icone: PanelsTopLeft,
                  titulo: 'Explore o portal',
                  texto: 'Indicadores e análises em um só lugar.',
                },
              ].map((item, i) => (
                <li key={item.titulo} className="flex items-center gap-4">
                  <span
                    className={cx(
                      'grid size-10 shrink-0 place-items-center rounded-xl border',
                      passo === i
                        ? 'border-lima bg-lima/10 text-lima'
                        : 'border-white/15 text-white/50',
                    )}
                  >
                    <item.icone size={19} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <div>
                    <p
                      className={cx(
                        'text-corpo font-medium',
                        passo === i ? 'text-white' : 'text-white/60',
                      )}
                    >
                      {item.titulo}
                    </p>
                    <p className="mt-1 text-legenda text-azul-100/70">{item.texto}</p>
                  </div>
                  {passo > i && (
                    <Check size={16} className="ml-auto text-lima" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ol>
            <p className="relative mt-12 text-legenda text-azul-100/60">
              Uma proposta de experiência para revisar com a equipe.
            </p>
          </aside>
          <section
            className="flex flex-col justify-center px-5 py-8 sm:px-10 lg:px-12 lg:py-10"
            aria-labelledby="titulo-auth"
          >
            <div className="mx-auto w-full max-w-md">
              <p className="mb-4 text-legenda font-medium uppercase tracking-[0.16em] text-teal-escuro">
                {etapa === 'cadastro'
                  ? 'Primeiro acesso'
                  : etapa === 'confirmacao'
                    ? 'Tudo certo'
                    : etapa === 'expirada'
                      ? 'Acesso ao portal'
                      : 'Sua visão 360 começa aqui'}
              </p>
              <h1 id="titulo-auth" className="text-display font-normal tracking-tight">
                {titulo}
              </h1>
              <p className="mt-2 mb-7 text-corpo leading-6 text-ink-2">{subtitulo}</p>
              {etapa === 'login' && (
                <FormularioLogin
                  pessoa={pessoa}
                  cenario={cenario}
                  aoEntrar={(p) => {
                    setPessoa(p)
                    navegar('/dev/auth/sessao')
                  }}
                />
              )}
              {etapa === 'cadastro' && (
                <FormularioCadastro
                  cenario={cenario}
                  aoCadastrar={(p) => {
                    setPessoa(p)
                    navegar('/dev/auth/confirmacao')
                  }}
                />
              )}
              {etapa === 'confirmacao' && (
                <div className="flex flex-col gap-5">
                  <div className="rounded-2xl border border-lima-escuro/30 bg-lima-suave p-6">
                    <CircleCheck size={36} className="mb-4 text-sucesso-texto" aria-hidden="true" />
                    <p className="text-titulo font-normal">
                      Cadastro de exemplo concluído, {pessoa.nome}.
                    </p>
                    <p className="mt-2 break-all text-corpo text-ink-2">{pessoa.email}</p>
                    <p className="mt-4 text-corpo leading-6 text-ink-2">
                      Nesta proposta, o cadastro leva ao login. A equipe ainda pode ajustar essa
                      passagem.
                    </p>
                  </div>
                  <Button
                    onClick={() => navegar('/dev/auth/login')}
                    className="h-12! w-full"
                    icone={<ArrowRight size={18} aria-hidden="true" />}
                  >
                    Ir para login
                  </Button>
                  <Link
                    to="/dev/auth/cadastro"
                    className="text-center text-corpo text-teal-profundo hover:underline"
                  >
                    Rever cadastro
                  </Link>
                </div>
              )}
              {etapa === 'sessao' && (
                <div className="flex flex-col gap-5">
                  <div className="rounded-2xl border border-borda-leve bg-surface-sutil p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="grid size-11 place-items-center rounded-full bg-azul-100 text-teal-profundo">
                        {pessoa.nome.charAt(0).toLocaleUpperCase('pt-BR')}
                      </span>
                      <div>
                        <p className="text-titulo font-medium">Olá, {pessoa.nome}.</p>
                        <p className="break-all text-legenda text-ink-2">{pessoa.email}</p>
                      </div>
                    </div>
                    <Badge variante="sucesso" ponto>
                      Sessão de exemplo
                    </Badge>
                    <p className="mt-4 flex items-center gap-2 text-corpo text-ink-2">
                      <Clock3 size={16} aria-hidden="true" />
                      Duração proposta: 60 minutos.
                    </p>
                  </div>
                  <Link
                    to="/painel"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-azul-300 px-5 text-corpo font-normal hover:bg-azul-400"
                  >
                    Visualizar Painel Executivo
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                  <Button variante="secundario" onClick={() => navegar('/dev/auth/expirada')}>
                    Simular sessão expirada
                  </Button>
                  <Button
                    variante="fantasma"
                    icone={<LogOut size={16} aria-hidden="true" />}
                    onClick={() => {
                      setPessoa(EXEMPLO)
                      navegar('/dev/auth/login')
                    }}
                  >
                    Sair da demonstração
                  </Button>
                  <p className="text-legenda leading-5 text-ink-2">
                    Esta tela simula a entrada. Nenhum token foi emitido e o acesso ao painel ainda
                    é livre.
                  </p>
                </div>
              )}
              {etapa === 'expirada' && (
                <div className="flex flex-col gap-5">
                  <div className="rounded-2xl border border-alerta/30 bg-alerta-suave p-6">
                    <Clock3 size={35} className="mb-4 text-alerta-escuro" aria-hidden="true" />
                    <p className="text-corpo leading-6 text-ink">
                      Para manter seu acesso, confirme novamente seu e-mail e senha.
                    </p>
                    <p className="mt-3 text-legenda leading-5 text-alerta-escuro">
                      Estado simulado para revisar a experiência de retorno ao login.
                    </p>
                  </div>
                  <Button
                    onClick={() => navegar('/dev/auth/login')}
                    className="h-12! w-full"
                    icone={<LogIn size={18} aria-hidden="true" />}
                  >
                    Entrar novamente
                  </Button>
                  <Link
                    to="/painel"
                    className="text-center text-corpo text-teal-profundo hover:underline"
                  >
                    Voltar à prévia do portal
                  </Link>
                </div>
              )}
            </div>
          </section>
        </div>
        {(etapa === 'login' || etapa === 'cadastro') && (
          <section
            aria-label="Cenários de demonstração"
            className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/80 bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="text-corpo font-medium">Cenários para revisão</h2>
              <p className="mt-1 text-legenda text-ink-2">
                Escolha um resultado e envie o formulário para ver o estado.
              </p>
            </div>
            <Select
              rotulo="Resultado simulado"
              valor={cenario}
              aoMudar={(valor) => setCenario(valor as CenarioEnvio)}
              opcoes={[
                { valor: 'normal', rotulo: 'Sucesso' },
                {
                  valor: 'invalido',
                  rotulo: etapa === 'login' ? 'Credenciais inválidas' : 'E-mail já cadastrado',
                },
                { valor: 'indisponivel', rotulo: 'Serviço indisponível' },
              ]}
              className="sm:w-64"
            />
          </section>
        )}
        <footer className="mt-6 text-center text-legenda text-teal-profundo">
          V-Energy Grid 360 · Protótipo de autenticação · Fluxo em revisão
        </footer>
      </div>
    </main>
  )
}
