import EmConstrucao from '@/components/common/EmConstrucao'
import Pagina from '@/layouts/Pagina'

export default function OrdensPage() {
  return (
    <Pagina titulo="Ordens de inspeção" subtitulo="Gestão do ciclo completo da fiscalização">
      <EmConstrucao
        tarefa="O2"
        responsavel="Gabriel"
        resumo="Lista por status, avanço para campo, registro de resultado e cancelamento com justificativa."
      />
    </Pagina>
  )
}
