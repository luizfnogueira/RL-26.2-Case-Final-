import ChatAssistente from '@/components/assistente/ChatAssistente'
import Card from '@/components/ui/Card'
import Pagina from '@/layouts/Pagina'

export default function AssistentePage() {
  return (
    <Pagina titulo="Assistente V-Energy" subtitulo="Pergunte sobre o negócio em linguagem natural">
      <Card className="flex h-[calc(100dvh-200px)] min-h-[560px] flex-col">
        <ChatAssistente variante="pagina" focarAoAbrir />
      </Card>
    </Pagina>
  )
}
