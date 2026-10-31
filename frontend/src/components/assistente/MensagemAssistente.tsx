import { CircleAlert, CircleHelp, RotateCw, Shield, Sparkles, TriangleAlert } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import type { ApiError } from '@/services/erro-api'
import { cx } from '@/utils/cx'
import { PERIODO_ATUAL_PADRAO, formatarMes } from '@/utils/periodos'
import ComoCheguei from './ComoCheguei'
import type { Mensagem } from './contexto'
import GraficoResposta from './GraficoResposta'
import TabelaResposta from './TabelaResposta'

type MensagemDoAssistente = Extract<Mensagem, { autor: 'assistente' }>
type Tom = 'neutro' | 'aviso' | 'perigo'

const AVATAR: Record<Tom, string> = {
  neutro: 'bg-azul-100 text-teal-profundo',
  aviso: 'bg-alerta-suave text-alerta-escuro',
  perigo: 'bg-perigo-suave text-perigo-escuro',
}

const BALAO: Record<Tom, string> = {
  neutro: 'bg-surface-alt text-ink',
  aviso: 'bg-alerta-suave text-alerta-escuro',
  perigo: 'bg-perigo-suave text-perigo-escuro',
}

/** Avatar do assistente (o ícone muda com o estado) e o balão da fala. */
function Fala({
  tom = 'neutro',
  icone,
  children,
}: {
  tom?: Tom
  icone: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={cx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', AVATAR[tom])}
      >
        {icone}
      </span>
      <div className={cx('min-w-0 rounded-[14px] px-3.5 py-2.5 text-corpo', BALAO[tom])}>
        {children}
      </div>
    </div>
  )
}

/** Texto da resposta com **destaques** em negrito (nomes de bairros, municípios…). */
function TextoComDestaques({ texto }: { texto: string }) {
  return (
    <p className="whitespace-pre-line">
      {texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
        parte.startsWith('**') && parte.endsWith('**') ? (
          <strong key={i} className="font-medium">
            {parte.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </p>
  )
}

function textoDoErro(erro: ApiError): string {
  const mantida = 'Sua pergunta foi mantida — tente novamente em instantes.'
  if (erro.codigo === 'REDE_INDISPONIVEL' || erro.status === 0) {
    return `Não foi possível falar com o servidor (REDE_INDISPONIVEL). ${mantida}`
  }
  if (erro.codigo === 'AGENTE_INDISPONIVEL' || erro.status === 503) {
    return `O assistente está indisponível no momento (${erro.codigo}). ${mantida}`
  }
  return `Não foi possível responder agora (${erro.codigo}). ${mantida}`
}

/** Último mês da Gold: o fim da janela atual do case (jun/2026). */
const ULTIMO_MES_GOLD = PERIODO_ATUAL_PADRAO.slice(-7)

/** "Dados até Jun/2026 · base carregada em 24/10/2026": até onde vão os dados e de quando é a carga. */
function RodapeDaBase({ goldAtualizadaEm }: { goldAtualizadaEm: string | null }) {
  const carga = goldAtualizadaEm ? new Date(goldAtualizadaEm) : null
  return (
    <p className="mt-2 text-legenda text-ink-2">
      Dados até {formatarMes(ULTIMO_MES_GOLD)}
      {carga && !Number.isNaN(carga.getTime()) && (
        <> · base carregada em {carga.toLocaleDateString('pt-BR')}</>
      )}
    </p>
  )
}

const ICONE = { size: 16, strokeWidth: 1.75 }
const TITULO_NAO_SEI = 'Não sei responder com os dados disponíveis'

/** O corpo não repete o título quando a resposta da API já começa com ele. */
function semTitulo(texto: string, titulo: string): string {
  return texto.toLocaleLowerCase('pt-BR').startsWith(titulo.toLocaleLowerCase('pt-BR'))
    ? texto.slice(titulo.length).replace(/^[\s.:,;—-]+/, '')
    : texto
}

type Props = {
  mensagem: MensagemDoAssistente
  aoTentarNovamente: () => void
  /** Reenvia a pergunta completa de uma opção do esclarecimento. */
  aoEscolher: (pergunta: string) => void
  enviando: boolean
}

/** Uma resposta do assistente em um dos estados: carregando, ok, não sei, bloqueado, esclarecer ou erro. */
export default function MensagemAssistente({
  mensagem,
  aoTentarNovamente,
  aoEscolher,
  enviando,
}: Props) {
  if (mensagem.estado === 'carregando') {
    return (
      <Fala icone={<Sparkles {...ICONE} />}>
        <span role="status" className="sr-only">
          O assistente está consultando os dados.
        </span>
        <span aria-hidden="true" className="flex h-[18px] items-center gap-1">
          {[0, 150, 300].map((atraso) => (
            <span
              key={atraso}
              className="size-1.5 rounded-full bg-teal motion-safe:animate-bounce"
              style={{ animationDelay: `${atraso}ms` }}
            />
          ))}
        </span>
      </Fala>
    )
  }

  if (mensagem.estado === 'erro') {
    return (
      <Fala icone={<CircleAlert {...ICONE} />}>
        <p role="alert">{textoDoErro(mensagem.erro)}</p>
        <button
          type="button"
          onClick={aoTentarNovamente}
          disabled={enviando}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-teal-escuro px-3.5 py-1.5 text-corpo text-teal-escuro hover:bg-azul-50 disabled:opacity-60"
        >
          <RotateCw size={15} aria-hidden="true" />
          Tentar novamente
        </button>
      </Fala>
    )
  }

  const { resposta } = mensagem
  if (resposta.status === 'bloqueado') {
    return (
      <div className="flex flex-col gap-2">
        <Fala tom="perigo" icone={<Shield {...ICONE} />}>
          <p className="mb-1 font-medium">Pedido bloqueado</p>
          <p>{resposta.resposta}</p>
          <ComoCheguei resposta={resposta} />
        </Fala>
        <p className="ml-[42px] inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-alt px-3 py-1 text-legenda text-ink">
          <Shield size={13} aria-hidden="true" />
          Comando destrutivo bloqueado · nenhum dado foi alterado
        </p>
      </div>
    )
  }

  if (resposta.status === 'esclarecer' && resposta.esclarecimento) {
    return (
      <Fala icone={<CircleHelp {...ICONE} />}>
        <p className="mb-2">{resposta.esclarecimento.pergunta}</p>
        <ul aria-label="Opções de esclarecimento" className="flex flex-wrap gap-2">
          {resposta.esclarecimento.opcoes.map((opcao) => (
            <li key={opcao.pergunta}>
              <button
                type="button"
                onClick={() => aoEscolher(opcao.pergunta)}
                disabled={enviando}
                className="rounded-full border border-teal-escuro bg-surface-card px-3.5 py-1.5 text-corpo text-teal-escuro hover:bg-azul-50 disabled:opacity-60"
              >
                {opcao.rotulo}
              </button>
            </li>
          ))}
        </ul>
      </Fala>
    )
  }

  if (resposta.status === 'nao_sei') {
    return (
      <Fala tom="aviso" icone={<TriangleAlert {...ICONE} />}>
        <p className="mb-1 font-medium">{TITULO_NAO_SEI}</p>
        <p>{semTitulo(resposta.resposta, TITULO_NAO_SEI)}</p>
        <ComoCheguei resposta={resposta} />
        <RodapeDaBase goldAtualizadaEm={resposta.metadados.gold_atualizada_em} />
      </Fala>
    )
  }

  return (
    <Fala icone={<Sparkles {...ICONE} />}>
      <TextoComDestaques texto={resposta.resposta} />
      {resposta.apresentacao === 'tabela' && resposta.dados.linhas.length > 0 && (
        <TabelaResposta dados={resposta.dados} />
      )}
      {resposta.apresentacao === 'grafico' && resposta.grafico && (
        <GraficoResposta grafico={resposta.grafico} dados={resposta.dados} />
      )}
      <ComoCheguei resposta={resposta} />
      <RodapeDaBase goldAtualizadaEm={resposta.metadados.gold_atualizada_em} />
    </Fala>
  )
}
