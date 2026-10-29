import { useParams } from 'react-router'
import BuscaUnidades from '@/components/unidades/BuscaUnidades'
import DetalheUnidade from '@/components/unidades/DetalheUnidade'
import Pagina from '@/layouts/Pagina'

/** Atende /unidades (busca) e /unidades/:id (visão 360 de uma UC). */
export default function UnidadePage() {
  const { id } = useParams()

  if (!id) {
    return (
      <Pagina
        titulo="Visão 360 da unidade consumidora"
        subtitulo="Busque por código da UC ou nome do titular"
      >
        <BuscaUnidades />
      </Pagina>
    )
  }

  return (
    <Pagina
      titulo="Visão 360 da unidade consumidora"
      subtitulo="Atendimento integrado em uma única tela"
    >
      <DetalheUnidade id={id} />
    </Pagina>
  )
}
