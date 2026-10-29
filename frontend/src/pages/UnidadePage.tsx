import { useParams } from 'react-router'
import EmConstrucao from '@/components/common/EmConstrucao'
import BuscaUnidades from '@/components/unidades/BuscaUnidades'
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
      <EmConstrucao
        tarefa="V1b"
        responsavel="Irvin"
        resumo={`Visão 360 da unidade ${id}: cadastro, consumo, faturas, medidor, geração solar, interrupções e chamados.`}
      />
    </Pagina>
  )
}
