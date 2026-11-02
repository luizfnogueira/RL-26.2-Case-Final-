import { Truck } from 'lucide-react'
import { useState } from 'react'
import Aviso from '@/components/ui/Aviso'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Textarea from '@/components/ui/Textarea'
import { iniciarCampo, normalizarErro } from '@/services'
import type { Ordem } from '@/types/inspecoes'

interface Props {
  ordem: Ordem | null
  aberto: boolean
  aoFechar: () => void
  aoSucesso: (ordemAtualizada: Ordem) => void
}

export default function ModalIniciarCampo({ ordem, aberto, aoFechar, aoSucesso }: Props) {
  if (!aberto || !ordem) return null

  return <ModalIniciarCampoForm ordem={ordem} aoFechar={aoFechar} aoSucesso={aoSucesso} />
}

function ModalIniciarCampoForm({
  ordem,
  aoFechar,
  aoSucesso,
}: {
  ordem: Ordem
  aoFechar: () => void
  aoSucesso: (ordemAtualizada: Ordem) => void
}) {
  const [equipe, setEquipe] = useState(ordem.equipe_responsavel || '')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleConfirmar = async () => {
    if (!equipe.trim()) {
      setErro('Informe a equipe responsável.')
      return
    }

    setSalvando(true)
    setErro(null)

    try {
      const atualizada = await iniciarCampo(ordem.id_ordem, {
        equipe_responsavel: equipe.trim(),
        observacoes: observacoes.trim() || undefined,
      })
      aoSucesso(atualizada)
      aoFechar()
    } catch (e) {
      setErro(normalizarErro(e).mensagem)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Iniciar vistoria em campo · Ordem #${ordem.id_ordem}`}
      descricao={`A ordem da UC ${ordem.id_uc} avançará para o status Em campo.`}
      tamanho="md"
      fecharAoClicarFora={!salvando}
      rodape={
        <>
          <Button variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            carregando={salvando}
            icone={<Truck size={16} aria-hidden="true" />}
          >
            Despachar equipe
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-borda-leve bg-surface-alt px-4 py-3 text-corpo">
          <p className="font-medium text-ink">Unidade Consumidora: {ordem.id_uc}</p>
          {ordem.motivo && <p className="mt-1 text-legenda text-ink-2">{ordem.motivo}</p>}
        </div>

        <Input
          rotulo="Equipe responsável"
          value={equipe}
          onChange={(e) => setEquipe(e.target.value)}
          placeholder="Ex.: Equipe Norte 02"
          ajuda="Confirme ou altere a equipe antes do despacho."
          disabled={salvando}
          required
        />

        <Textarea
          rotulo="Observações de despacho (opcional)"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Instruções operacionais para a equipe em campo..."
          disabled={salvando}
        />

        {erro && (
          <Aviso variante="perigo" anunciar>
            {erro}
          </Aviso>
        )}
      </div>
    </Modal>
  )
}
