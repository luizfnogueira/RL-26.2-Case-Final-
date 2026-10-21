import EmConstrucao from '@/components/common/EmConstrucao'
import Pagina from '@/layouts/Pagina'

export default function FilaPage() {
  return (
    <Pagina titulo="Fila de inspeção priorizada" subtitulo="UCs com maior potencial de recuperação">
      <EmConstrucao
        tarefa="A2"
        responsavel="Gabriel"
        resumo="Ranking de UCs suspeitas com motivos e energia a recuperar, e geração de ordens de inspeção."
      />
    </Pagina>
  )
}
