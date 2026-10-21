import EmConstrucao from '@/components/common/EmConstrucao'
import Pagina from '@/layouts/Pagina'

export default function OperacaoPage() {
  return (
    <Pagina
      titulo="Continuidade DEC / FEC"
      subtitulo="Indicadores de continuidade do serviço por alimentador"
    >
      <EmConstrucao
        tarefa="R1b"
        responsavel="Arthur"
        resumo="Série mensal de DEC e FEC, ranking dos piores alimentadores e ranking regional."
      />
    </Pagina>
  )
}
