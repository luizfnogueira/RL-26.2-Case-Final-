import { AlertOctagon, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
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

  return (
    <ModalCancelarOrdemForm
      ordem={ordem}
      aoFechar={aoFechar}
      aoSucesso={aoSucesso}
    />
  )
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
            Voltar
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          A ordem será encerrada sem realização de vistoria e o motivo será gravado de forma
          permanente no histórico. Ordens canceladas liberam a UC para nova fiscalização futura.
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="justificativa-cancelamento" className="text-sm font-medium text-[#2d425a]">
            Justificativa do cancelamento *
          </label>
          <textarea
            id="justificativa-cancelamento"
            rows={3}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Ex.: Ordem gerada em duplicidade, consumidor com acesso impedido, erro cadastral..."
            disabled={salvando}
            className="rounded-md border border-[#cfd9e0] bg-white p-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
          />
        </div>

        {erro && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <ShieldAlert size={16} aria-hidden="true" />
            {erro}
          </div>
        )}
      </div>
    </Modal>
  )
}

