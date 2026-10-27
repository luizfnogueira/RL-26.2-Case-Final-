import { ShieldAlert, Truck } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
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

  return (
    <ModalIniciarCampoForm
      ordem={ordem}
      aoFechar={aoFechar}
      aoSucesso={aoSucesso}
    />
  )
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
      descricao={`A ordem da UC ${ordem.id_uc} avançará para o status EM CAMPO.`}
      tamanho="md"
      fecharAoClicarFora={!salvando}
      rodape={
        <>
          <Button variante="secundario" onClick={aoFechar} disabled={salvando}>
            Voltar
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
        <div className="rounded-lg bg-[#f0f4f7] p-3 text-xs text-[#3b4752]">
          <p className="font-semibold text-[#2d425a]">Unidade Consumidora: {ordem.id_uc}</p>
          {ordem.motivo && <p className="mt-1 text-[#65737e]">{ordem.motivo}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="equipe-campo" className="text-sm font-medium text-[#2d425a]">
            Equipe responsável *
          </label>
          <input
            id="equipe-campo"
            value={equipe}
            onChange={(e) => setEquipe(e.target.value)}
            placeholder="Ex.: Equipe Norte 02"
            disabled={salvando}
            className="h-10 rounded-md border border-[#cfd9e0] bg-white px-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
          />
          <span className="text-[11px] text-[#7d858d]">
            Confirme ou altere a equipe antes do despacho.
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="obs-despacho" className="text-sm font-medium text-[#2d425a]">
            Observações de despacho (opcional)
          </label>
          <textarea
            id="obs-despacho"
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Instruções operacionais para a equipe em campo..."
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

