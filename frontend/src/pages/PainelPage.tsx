import EmConstrucao from '@/components/common/EmConstrucao'
import Pagina from '@/layouts/Pagina'

export default function PainelPage() {
  return (
    <Pagina titulo="Painel executivo" subtitulo="Visão consolidada da saúde do negócio">
      <EmConstrucao
        tarefa="T1"
        responsavel="Arthur"
        resumo="Seis KPIs com comparação entre períodos e o gráfico de 48 meses de receita e volume."
      />
    </Pagina>
  )
}
