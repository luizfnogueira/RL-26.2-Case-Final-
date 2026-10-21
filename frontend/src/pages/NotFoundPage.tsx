import { Link } from 'react-router'
import Pagina from '@/layouts/Pagina'

export default function NotFoundPage() {
  return (
    <Pagina titulo="Página não encontrada" subtitulo="O endereço acessado não existe no portal">
      <section className="flex flex-col items-center gap-3 rounded-card bg-surface-card px-6 py-16 text-center shadow-card">
        <p className="text-corpo text-ink-2">Confira o endereço ou volte para o painel.</p>
        <Link
          to="/painel"
          className="rounded-full bg-azul-300 px-5 py-2.5 text-titulo font-normal text-teal-profundo transition-colors hover:bg-azul-400"
        >
          Ir para o painel executivo
        </Link>
      </section>
    </Pagina>
  )
}
