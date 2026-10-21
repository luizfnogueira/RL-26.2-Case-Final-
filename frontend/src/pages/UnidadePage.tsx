import { useParams } from 'react-router'
import EmConstrucao from '@/components/common/EmConstrucao'
import Pagina from '@/layouts/Pagina'

/** Atende /unidades (busca) e /unidades/:id (visão 360 de uma UC). */
export default function UnidadePage() {
  const { id } = useParams()

  return (
    <Pagina
      titulo="Visão 360 da unidade consumidora"
      subtitulo="Atendimento integrado em uma única tela"
    >
      <EmConstrucao
        tarefa="V1b"
        responsavel="Irvin"
        resumo={
          id
            ? `Visão 360 da unidade ${id}: cadastro, consumo, faturas, medidor, geração solar, interrupções e chamados.`
            : 'Busca por código da UC e visão 360 com diagnóstico "a conta veio alta?".'
        }
      />
    </Pagina>
  )
}
