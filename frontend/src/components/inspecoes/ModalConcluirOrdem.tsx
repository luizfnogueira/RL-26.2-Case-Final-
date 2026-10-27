import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { concluirInspecao, normalizarErro } from '@/services'
import type { Ordem, ResultadoEnvio } from '@/types/inspecoes'

interface Props {
  ordem: Ordem | null
  aberto: boolean
  aoFechar: () => void
  aoSucesso: (ordemAtualizada: Ordem) => void
}

const TIPOS_IRREGULARIDADE = [
  'BY-PASS',
  'LIGAÇÃO DIRETA',
  'FRAUDE NO MEDIDOR',
  'VIOLAÇÃO DE LACRE',
  'DESVIO CLANDESTINO',
  'OUTRO',
]

export default function ModalConcluirOrdem({ ordem, aberto, aoFechar, aoSucesso }: Props) {
  if (!aberto || !ordem) return null

  return (
    <ModalConcluirOrdemForm
      ordem={ordem}
      aoFechar={aoFechar}
      aoSucesso={aoSucesso}
    />
  )
}

function ModalConcluirOrdemForm({
  ordem,
  aoFechar,
  aoSucesso,
}: {
  ordem: Ordem
  aoFechar: () => void
  aoSucesso: (ordemAtualizada: Ordem) => void
}) {
  const agora = new Date()
  const tzOffset = agora.getTimezoneOffset() * 60000
  const localIso = new Date(agora.getTime() - tzOffset).toISOString().slice(0, 16)

  const [irregularidade, setIrregularidade] = useState<boolean>(true)
  const [tipo, setTipo] = useState('BY-PASS')
  const [outroTipo, setOutroTipo] = useState('')
  const [kwh, setKwh] = useState<string>(ordem.kwh_estimado ? String(ordem.kwh_estimado) : '0')
  const [observacoes, setObservacoes] = useState('')
  const [dataHora, setDataHora] = useState(localIso)
  const [inspetor, setInspetor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleConfirmar = async () => {
    if (!observacoes.trim()) {
      setErro('Observações da vistoria são obrigatórias.')
      return
    }

    const tipoFinal = tipo === 'OUTRO' ? outroTipo.trim().toUpperCase() : tipo
    if (irregularidade && !tipoFinal) {
      setErro('Informe o tipo de irregularidade detectada.')
      return
    }

    const valorKwh = irregularidade ? Number(kwh) : 0
    if (irregularidade && (!Number.isFinite(valorKwh) || valorKwh < 0)) {
      setErro('O volume recuperado (kWh) deve ser maior ou igual a zero.')
      return
    }

    setSalvando(true)
    setErro(null)

    let dataIso: string | null = null
    if (dataHora) {
      const d = new Date(dataHora)
      if (!Number.isNaN(d.getTime())) {
        dataIso = d.toISOString()
      }
    }

    const resultado: ResultadoEnvio = {
      irregularidade_detectada: irregularidade,
      tipo_irregularidade: irregularidade ? tipoFinal : null,
      kwh_recuperado: irregularidade ? valorKwh : 0,
      observacoes: observacoes.trim(),
      data_inspecao: dataIso,
      inspetor: inspetor.trim() || null,
    }

    try {
      const atualizada = await concluirInspecao(ordem.id_ordem, resultado)
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
      titulo={`Registrar resultado em campo · Ordem #${ordem.id_ordem}`}
      descricao={`Vistoria realizada na UC ${ordem.id_uc} pela equipe ${ordem.equipe_responsavel}.`}
      tamanho="lg"
      fecharAoClicarFora={!salvando}
      rodape={
        <>
          <Button variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            carregando={salvando}
            icone={<CheckCircle2 size={16} aria-hidden="true" />}
          >
            Concluir vistoria
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Toggle Irregularidade */}
        <div>
          <label className="text-sm font-medium text-[#2d425a]">
            Resultado da inspeção técnica *
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIrregularidade(true)}
              className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all ${
                irregularidade
                  ? 'border-amber-400 bg-amber-50 text-amber-900 shadow-sm'
                  : 'border-[#cfd9e0] bg-white text-[#59656d] hover:bg-[#f6f9fa]'
              }`}
            >
              <AlertTriangle size={18} className={irregularidade ? 'text-amber-600' : 'text-[#7d858d]'} />
              Irregularidade confirmada
            </button>
            <button
              type="button"
              onClick={() => setIrregularidade(false)}
              className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all ${
                !irregularidade
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-sm'
                  : 'border-[#cfd9e0] bg-white text-[#59656d] hover:bg-[#f6f9fa]'
              }`}
            >
              <CheckCircle2 size={18} className={!irregularidade ? 'text-emerald-600' : 'text-[#7d858d]'} />
              Sem irregularidade (normal)
            </button>
          </div>
        </div>

        {/* Campos condicionais de irregularidade */}
        {irregularidade ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="tipo-irregularidade" className="text-xs font-semibold text-[#2d425a]">
                  Tipo de irregularidade *
                </label>
                <select
                  id="tipo-irregularidade"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  disabled={salvando}
                  className="h-10 rounded-md border border-[#cfd9e0] bg-white px-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
                >
                  {TIPOS_IRREGULARIDADE.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {tipo === 'OUTRO' && (
                  <input
                    type="text"
                    placeholder="Especifique o tipo..."
                    value={outroTipo}
                    onChange={(e) => setOutroTipo(e.target.value)}
                    className="mt-2 h-9 rounded-md border border-[#cfd9e0] bg-white px-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="kwh-recuperado" className="text-xs font-semibold text-[#2d425a]">
                  Energia recuperada (kWh) *
                </label>
                <input
                  id="kwh-recuperado"
                  type="number"
                  min="0"
                  step="any"
                  value={kwh}
                  onChange={(e) => setKwh(e.target.value)}
                  disabled={salvando}
                  className="h-10 rounded-md border border-[#cfd9e0] bg-white px-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
                />
                <span className="text-[11px] text-[#7d858d]">
                  Volume estimado recuperado pela correção da fraude.
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
            A instalação do consumidor foi avaliada e nenhuma anomalia ou desvio foi detectado.
            O volume recuperado será automaticamente registrado como 0 kWh.
          </div>
        )}

        {/* Metadados da inspeção */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="data-inspecao" className="text-sm font-medium text-[#2d425a]">
              Data e horário da vistoria
            </label>
            <input
              id="data-inspecao"
              type="datetime-local"
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
              disabled={salvando}
              className="h-10 rounded-md border border-[#cfd9e0] bg-white px-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="inspetor" className="text-sm font-medium text-[#2d425a]">
              Inspetor responsável
            </label>
            <input
              id="inspetor"
              type="text"
              placeholder="Ex.: Inspetor Carlos Silva"
              value={inspetor}
              onChange={(e) => setInspetor(e.target.value)}
              disabled={salvando}
              className="h-10 rounded-md border border-[#cfd9e0] bg-white px-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
            />
          </div>
        </div>

        {/* Observações da vistoria (obrigatório) */}
        <div className="flex flex-col gap-1">
          <label htmlFor="obs-vistoria" className="text-sm font-medium text-[#2d425a]">
            Observações e laudo técnico *
          </label>
          <textarea
            id="obs-vistoria"
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Descreva as condições encontradas, ações realizadas e lacres aplicados..."
            disabled={salvando}
            className="rounded-md border border-[#cfd9e0] bg-white p-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
          />
          <span className="text-[11px] text-[#7d858d]">
            Campo obrigatório para formalização da ordem no portal.
          </span>
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

