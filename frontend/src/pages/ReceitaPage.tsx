import EmConstrucao from '@/components/common/EmConstrucao'
import Pagina from '@/layouts/Pagina'

export default function ReceitaPage() {
  return (
    <Pagina
      titulo="Diagnóstico da receita"
      subtitulo="Decomposição da variação de preço, volume e mix"
    >
      <EmConstrucao
        tarefa="F5"
        responsavel="Gheyson"
        resumo="Insight de IA, ponte da receita (preço, volume e bandeira/mix) e drill-down por município, bairro e classe."
      />
    </Pagina>
  )
}
