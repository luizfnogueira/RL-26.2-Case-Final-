import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import Aviso from '@/components/ui/Aviso'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { cx } from '@/utils/cx'
import { concluirInspecao, normalizarErro } from '@/services'
import type { Ordem, ResultadoEnvio } from '@/types/inspecoes'

interface Props {
  ordem: Ordem | null
  aberto: boolean
  aoFechar: () => void
  aoSucesso: (ordemAtualizada: Ordem) => void
}

/** O kwh_estimado da fila cobre 3 meses (queda mensal × 3); o campo pede o valor por mês. */
const MESES_ESTIMATIVA_FILA = 3

const TIPOS_IRREGULARIDADE = [
  'BY-PASS',
  'LIGAÇÃO DIRETA',
  'FRAUDE NO MEDIDOR',
  'VIOLAÇÃO DE LACRE',
  'DESVIO CLANDESTINO',
  'OUTRO',
]

const OPCOES_TIPO = TIPOS_IRREGULARIDADE.map((t) => ({ valor: t, rotulo: t }))

export default function ModalConcluirOrdem({ ordem, aberto, aoFechar, aoSucesso }: Props) {
  if (!aberto || !ordem) return null

  return <ModalConcluirOrdemForm ordem={ordem} aoFechar={aoFechar} aoSucesso={aoSucesso} />
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

  // Sem resposta marcada: o inspetor registra o que viu, sem ser puxado pela suspeita da fila
  const [irregularidade, setIrregularidade] = useState<boolean | null>(null)
  const [tipo, setTipo] = useState('')
  const [outroTipo, setOutroTipo] = useState('')
  const [kwh, setKwh] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [dataHora, setDataHora] = useState(localIso)
  const [inspetor, setInspetor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleConfirmar = async () => {
    if (irregularidade === null) {
      setErro('Informe se a inspeção encontrou irregularidade.')
      return
    }
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
    if (irregularidade && (!kwh.trim() || !Number.isFinite(valorKwh) || valorKwh < 0)) {
      setErro('Informe a irregularidade por mês (kWh/mês), maior ou igual a zero.')
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

  const ajudaKwh =
    ordem.kwh_estimado !== null
      ? `Consumo mensal desviado, estimado em campo. Estimativa da fila: ${(
          ordem.kwh_estimado / MESES_ESTIMATIVA_FILA
        ).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kWh/mês.`
      : 'Consumo mensal desviado, estimado em campo.'

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
            disabled={irregularidade === null}
            motivoDesabilitado="Escolha se houve irregularidade para concluir a vistoria."
            icone={<CheckCircle2 size={16} aria-hidden="true" />}
          >
            Concluir vistoria
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-legenda font-medium text-ink">
            Resultado da inspeção técnica <span className="text-perigo-escuro">*</span>
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setIrregularidade(true)}
              aria-pressed={irregularidade === true}
              className={cx(
                'flex items-center justify-center gap-2 rounded-md border p-3 text-corpo font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
                irregularidade === true
                  ? 'border-alerta bg-alerta-suave text-alerta-escuro'
                  : 'border-borda bg-surface-card text-ink-2 hover:border-ink-3 hover:bg-surface-alt',
              )}
            >
              <AlertTriangle
                size={18}
                aria-hidden="true"
                className={irregularidade === true ? 'text-alerta-escuro' : 'text-ink-3'}
              />
              Irregularidade confirmada
            </button>
            <button
              type="button"
              onClick={() => setIrregularidade(false)}
              aria-pressed={irregularidade === false}
              className={cx(
                'flex items-center justify-center gap-2 rounded-md border p-3 text-corpo font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
                irregularidade === false
                  ? 'border-sucesso bg-sucesso-suave text-sucesso-texto'
                  : 'border-borda bg-surface-card text-ink-2 hover:border-ink-3 hover:bg-surface-alt',
              )}
            >
              <CheckCircle2
                size={18}
                aria-hidden="true"
                className={irregularidade === false ? 'text-sucesso-texto' : 'text-ink-3'}
              />
              Sem irregularidade (normal)
            </button>
          </div>
        </fieldset>

        {irregularidade === true && (
          <div className="rounded-md border border-alerta/30 bg-alerta-suave/40 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Select
                  rotulo="Tipo de irregularidade"
                  valor={tipo}
                  aoMudar={setTipo}
                  opcoes={OPCOES_TIPO}
                  vazio="Selecione o tipo"
                  disabled={salvando}
                  required
                />
                {tipo === 'OUTRO' && (
                  <Input
                    rotulo="Especifique o tipo"
                    value={outroTipo}
                    onChange={(e) => setOutroTipo(e.target.value)}
                    placeholder="Descreva a irregularidade encontrada"
                    disabled={salvando}
                  />
                )}
              </div>

              <Input
                rotulo="Irregularidade por mês (kWh/mês)"
                type="number"
                min="0"
                step="any"
                value={kwh}
                onChange={(e) => setKwh(e.target.value)}
                disabled={salvando}
                ajuda={ajudaKwh}
                required
              />
            </div>
          </div>
        )}

        {irregularidade === false && (
          <Aviso variante="sucesso">
            A instalação do consumidor foi avaliada e nenhuma anomalia ou desvio foi detectado. A
            irregularidade por mês será registrada como 0 kWh.
          </Aviso>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            rotulo="Data e horário da vistoria"
            type="datetime-local"
            value={dataHora}
            onChange={(e) => setDataHora(e.target.value)}
            disabled={salvando}
          />

          <Input
            rotulo="Inspetor responsável"
            type="text"
            placeholder="Ex.: Inspetor Carlos Silva"
            value={inspetor}
            onChange={(e) => setInspetor(e.target.value)}
            disabled={salvando}
          />
        </div>

        <Textarea
          rotulo="Observações e laudo técnico"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Descreva as condições encontradas, ações realizadas e lacres aplicados..."
          ajuda="Campo obrigatório para formalização da ordem no portal."
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
