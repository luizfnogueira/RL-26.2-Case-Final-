import { Hammer } from 'lucide-react'

type Props = {
  /** ID da tarefa no cronograma (ex.: F5). */
  tarefa: string
  /** Quem constrói a tela. */
  responsavel: string
  resumo: string
}

/** Marcador de tela ainda não implementada. Sai de cada página quando a tarefa fecha. */
export default function EmConstrucao({ tarefa, responsavel, resumo }: Props) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-card bg-surface-card px-6 py-16 text-center shadow-card">
      <span
        aria-hidden="true"
        className="mb-2 grid size-16 place-items-center rounded-full bg-azul-50 text-teal-escuro"
      >
        <Hammer size={28} strokeWidth={1.5} />
      </span>
      <h2 className="text-titulo font-normal">Tela em construção</h2>
      <p className="max-w-md text-corpo text-ink-2">{resumo}</p>
      <p className="mt-2 text-legenda font-medium text-teal-escuro">
        Tarefa {tarefa} · {responsavel}
      </p>
    </section>
  )
}
