import { useEffect, type ReactNode } from 'react'
import AcoesCabecalho from './AcoesCabecalho'

type Props = {
  titulo: string
  subtitulo: string
  children: ReactNode
  goldAtualizadaEm?: string | null
}

/** Cabeçalho + área de conteúdo padrão de toda tela do portal. */
export default function Pagina({ titulo, subtitulo, children, goldAtualizadaEm }: Props) {
  useEffect(() => {
    document.title = `${titulo} · V-Energy Grid 360`
  }, [titulo])

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-numero font-light md:text-display">{titulo}</h1>
          <p className="text-corpo text-ink-2">{subtitulo}</p>
        </div>
        <AcoesCabecalho goldAtualizadaEm={goldAtualizadaEm} />
      </header>
      <div className="mt-4 flex flex-col gap-4 md:mt-6 md:gap-6">{children}</div>
    </>
  )
}
