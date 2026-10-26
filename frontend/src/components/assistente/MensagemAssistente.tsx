import { CircleAlert, RotateCw, Shield, Sparkles, TriangleAlert } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import type { ApiError } from '@/services/erro-api'
import { cx } from '@/utils/cx'
import ComoCheguei from './ComoCheguei'
import type { Mensagem } from './contexto'

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

const ICONE = { size: 16, strokeWidth: 1.75 }
const TITULO_NAO_SEI = 'Não sei responder com os dados disponíveis'

/** O corpo não repete o título quando a resposta da API já começa com ele. */
function semTitulo(texto: string, titulo: string): string {
  return texto.toLocaleLowerCase('pt-BR').startsWith(titulo.toLocaleLowerCase('pt-BR'))
    ? texto.slice(titulo.length).replace(/^[\s.:,;—-]+/, '')
    : texto
}

type Props = { mensagem: MensagemDoAssistente; aoTentarNovamente: () => void; enviando: boolean }

/** Uma resposta do assistente em um dos estados: carregando, ok, não sei, bloqueado ou erro. */
export default function MensagemAssistente({ mensagem, aoTentarNovamente, enviando }: Props) {
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
        </Fala>
        <p className="ml-[42px] inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-alt px-3 py-1 text-legenda text-ink">
          <Shield size={13} aria-hidden="true" />
          Comando destrutivo bloqueado · nenhum dado foi alterado
        </p>
      </div>
    )
  }

  if (resposta.status === 'nao_sei') {
    return (
      <Fala tom="aviso" icone={<TriangleAlert {...ICONE} />}>
        <p className="mb-1 font-medium">{TITULO_NAO_SEI}</p>
        <p>{semTitulo(resposta.resposta, TITULO_NAO_SEI)}</p>
      </Fala>
    )
  }

  return (
    <Fala icone={<Sparkles {...ICONE} />}>
      <TextoComDestaques texto={resposta.resposta} />
      <ComoCheguei resposta={resposta} />
    </Fala>
  )
}
