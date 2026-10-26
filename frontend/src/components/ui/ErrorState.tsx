import { RotateCw, TriangleAlert } from 'lucide-react'
import { ehErroApi } from '@/services/erro-api'
import { cx } from '@/utils/cx'
import Button from './Button'

type Props = {
  /** Erro vindo de `useConsulta`/`useAcao`. Se for ApiError, a mensagem da API é exibida. */
  erro?: unknown
  titulo?: string
  /** Mensagem própria; tem prioridade sobre a do erro. */
  mensagem?: string
  /** Mostra o botão "Tentar de novo". */
  aoTentarNovamente?: () => void
  className?: string
}

const MENSAGEM_PADRAO = 'Não foi possível carregar os dados. Tente novamente em instantes.'

/** Falha de carregamento ou de ação, com saída para tentar de novo. Lida por leitores de tela. */
export default function ErrorState({
  erro,
  titulo = 'Algo deu errado',
  mensagem,
  aoTentarNovamente,
  className,
}: Props) {
  const api = ehErroApi(erro) ? erro : null
  const texto = mensagem ?? (api && api.status !== 0 ? api.mensagem : MENSAGEM_PADRAO)
  return (
    <div
      role="alert"
      className={cx('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}
    >
      <span
        aria-hidden="true"
        className="mb-1 grid size-14 place-items-center rounded-full bg-perigo-suave text-perigo-escuro"
      >
        <TriangleAlert size={26} strokeWidth={1.5} />
      </span>
      <h3 className="text-titulo font-normal">{titulo}</h3>
      <p className="max-w-sm text-corpo text-ink-2">{texto}</p>
      {api && api.status !== 0 && (
        <p className="text-legenda text-ink-3">
          {api.codigo} · HTTP {api.status}
        </p>
      )}
      {aoTentarNovamente && (
        <Button
          variante="secundario"
          icone={<RotateCw size={16} aria-hidden="true" />}
          onClick={aoTentarNovamente}
          className="mt-2"
        >
          Tentar de novo
        </Button>
      )}
    </div>
  )
}
