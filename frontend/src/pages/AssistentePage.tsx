import EmConstrucao from '@/components/common/EmConstrucao'
import Pagina from '@/layouts/Pagina'

export default function AssistentePage() {
  return (
    <Pagina titulo="Assistente V-Energy" subtitulo="Pergunte sobre o negócio em linguagem natural">
      <EmConstrucao
        tarefa="F6"
        responsavel="Thiago"
        resumo="Chat somente leitura com auditoria da resposta (SQL, tabelas Gold e dados) e estados “não sei” e bloqueado."
      />
    </Pagina>
  )
}
