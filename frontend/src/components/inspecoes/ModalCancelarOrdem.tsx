import { AlertOctagon } from 'lucide-react'
import { useState } from 'react'
import Aviso from '@/components/ui/Aviso'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Textarea from '@/components/ui/Textarea'
import { cancelarInspecao, normalizarErro } from '@/services'
import type { Ordem } from '@/types/inspecoes'

interface Props {
  ordem: Ordem | null
  aberto: boolean
  aoFechar: () => void
  aoSucesso: (ordemAtualizada: Ordem) => void
}

export default function ModalCancelarOrdem({ ordem, aberto, aoFechar, aoSucesso }: Props) {
  if (!aberto || !ordem) return null

  return <ModalCancelarOrdemForm ordem={ordem} aoFechar={aoFechar} aoSucesso={aoSucesso} />
}

function ModalCancelarOrdemForm({
  ordem,
  aoFechar,
  aoSucesso,
}: {
  ordem: Ordem
  aoFechar: () => void
  aoSucesso: (ordemAtualizada: Ordem) => void
}) {
  const [justificativa, setJustificativa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleConfirmar = async () => {
    if (!justificativa.trim()) {
      setErro('Informe a justificativa do cancelamento.')
      return
    }

    setSalvando(true)
    setErro(null)

    try {
      const atualizada = await cancelarInspecao(ordem.id_ordem, justificativa.trim())
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
      titulo={`Cancelar ordem de inspeção #${ordem.id_ordem}`}
      descricao={`Esta ação cancelará a fiscalização da UC ${ordem.id_uc}.`}
      tamanho="md"
      fecharAoClicarFora={!salvando}
      rodape={
        <>
          <Button variante="secundario" onClick={aoFechar} disabled={salvando}>
            Manter ordem
          </Button>
          <Button
            variante="perigo"
            onClick={handleConfirmar}
            carregando={salvando}
            icone={<AlertOctagon size={16} aria-hidden="true" />}
          >
            Confirmar cancelamento
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Aviso variante="alerta">
          A ordem será encerrada sem realização de vistoria e o motivo será gravado de forma
          permanente no histórico. Ordens canceladas liberam a UC para nova fiscalização futura.
        </Aviso>

        <Textarea
          rotulo="Justificativa do cancelamento"
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Ex.: Ordem gerada em duplicidade, consumidor com acesso impedido, erro cadastral..."
          ajuda="Obrigatório. Fica registrado no histórico da ordem."
          disabled={salvando}
          required
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
