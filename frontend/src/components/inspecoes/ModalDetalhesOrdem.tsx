import { CheckCircle2, History } from 'lucide-react'
import Badge, { type VarianteBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import type { Ordem, StatusOrdem } from '@/types/inspecoes'
import { formatarEnergia } from '@/utils/formatacao'

interface Props {
  ordem: Ordem | null
  aberto: boolean
  aoFechar: () => void
}

const STATUS_VARIANTES: Record<StatusOrdem, VarianteBadge> = {
  ABERTA: 'info',
  EM_CAMPO: 'alerta',
  CONCLUIDA: 'sucesso',
  CANCELADA: 'neutro',
}

const STATUS_ROTULOS: Record<StatusOrdem, string> = {
  ABERTA: 'Aberta',
  EM_CAMPO: 'Em campo',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
}

function formatarDataHora(dataStr?: string | null): string {
  if (!dataStr) return '—'
  const d = new Date(dataStr)
  if (Number.isNaN(d.getTime())) return dataStr
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatarData(dataStr?: string | null): string {
  if (!dataStr) return '—'
  const d = new Date(dataStr)
  if (Number.isNaN(d.getTime())) return dataStr
  return d.toLocaleDateString('pt-BR')
}

export default function ModalDetalhesOrdem({ ordem, aberto, aoFechar }: Props) {
  if (!ordem) return null

  const historicoOrdenado = [...ordem.historico].sort(
    (a, b) => new Date(b.data_mudanca).getTime() - new Date(a.data_mudanca).getTime(),
  )

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={`Ordem de inspeção #${ordem.id_ordem}`}
      descricao={`Unidade Consumidora: ${ordem.id_uc}`}
      tamanho="lg"
      rodape={
        <Button variante="secundario" onClick={aoFechar}>
          Fechar
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Cabeçalho de Status e Atribuição */}
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#dfeaf0] bg-[#f4f7f9] p-4 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium text-[#7d858d] uppercase">Status atual</p>
            <div className="mt-1">
              <Badge variante={STATUS_VARIANTES[ordem.status]} ponto>
                {STATUS_ROTULOS[ordem.status]}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#7d858d] uppercase">Equipe</p>
            <p className="mt-1 text-sm font-semibold text-[#2d425a]">{ordem.equipe_responsavel}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#7d858d] uppercase">Data criação</p>
            <p className="mt-1 text-sm text-[#3b4752]">{formatarData(ordem.data_criacao)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#7d858d] uppercase">Previsão</p>
            <p className="mt-1 text-sm text-[#3b4752]">{formatarData(ordem.data_prevista)}</p>
          </div>
        </div>

        {/* Motivo e kWh estimado */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[#2d425a] uppercase tracking-wider">
            Contexto da fiscalização
          </h3>
          <div className="rounded-lg border border-[#e2eaf0] bg-white p-3 text-xs space-y-1.5">
            <div className="flex items-start justify-between gap-4">
              <span className="text-[#65737e]">Motivo:</span>
              <span className="font-medium text-[#2d425a] text-right">{ordem.motivo ?? '—'}</span>
            </div>
            {ordem.kwh_estimado !== null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#65737e]">Estimativa de recuperação:</span>
                <span className="font-semibold text-teal-profundo">
                  {formatarEnergia(ordem.kwh_estimado)}
                </span>
              </div>
            )}
            {ordem.observacoes && (
              <div className="pt-2 border-t border-[#edf2f5]">
                <p className="text-[#65737e] mb-1">Observações da ordem:</p>
                <p className="text-[#2d425a] whitespace-pre-wrap">{ordem.observacoes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Se concluída: Detalhes do Resultado */}
        {ordem.status === 'CONCLUIDA' && ordem.resultado && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[#2d425a] uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Resultado da vistoria técnica
            </h3>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-emerald-950">Irregularidade:</span>
                <Badge
                  variante={ordem.resultado.irregularidade_detectada ? 'perigo' : 'sucesso'}
                  ponto
                >
                  {ordem.resultado.irregularidade_detectada
                    ? `${ordem.resultado.tipo_irregularidade ?? 'Detectada'}`
                    : 'Sem irregularidade'}
                </Badge>
              </div>

              {ordem.resultado.irregularidade_detectada && (
                <div className="flex items-center justify-between">
                  <span className="text-[#59656d]">Energia recuperada:</span>
                  <span className="font-bold text-[#b43d3d] text-sm">
                    {formatarEnergia(ordem.resultado.kwh_recuperado)}
                  </span>
                </div>
              )}

              {ordem.resultado.inspetor && (
                <div className="flex items-center justify-between">
                  <span className="text-[#59656d]">Inspetor responsável:</span>
                  <span className="font-medium text-[#2d425a]">{ordem.resultado.inspetor}</span>
                </div>
              )}

              {ordem.resultado.data_inspecao && (
                <div className="flex items-center justify-between">
                  <span className="text-[#59656d]">Data da vistoria:</span>
                  <span className="text-[#2d425a]">
                    {formatarDataHora(ordem.resultado.data_inspecao)}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-emerald-100">
                <span className="text-[#59656d] block mb-1">Laudo / Observações:</span>
                <p className="text-[#2d425a] whitespace-pre-wrap">{ordem.resultado.observacoes}</p>
              </div>
            </div>
          </div>
        )}

        {/* Se cancelada: Justificativa */}
        {ordem.status === 'CANCELADA' && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[#8a3333] uppercase tracking-wider">
              Motivo do cancelamento
            </h3>
            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-xs space-y-1">
              <p className="text-[#722a2a] font-medium">
                {ordem.justificativa_cancelamento || 'Sem justificativa informada.'}
              </p>
              {ordem.data_cancelamento && (
                <p className="text-[11px] text-[#9a4b4b]">
                  Cancelada em: {formatarDataHora(ordem.data_cancelamento)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Linha do tempo de histórico */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[#2d425a] uppercase tracking-wider flex items-center gap-1.5">
            <History size={14} />
            Histórico de alterações ({historicoOrdenado.length})
          </h3>
          <div className="relative pl-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#dfeaf0] space-y-3">
            {historicoOrdenado.map((evento) => (
              <div key={evento.id_historico} className="relative text-xs">
                <span className="absolute -left-[14px] top-1 size-2 rounded-full border-2 border-white bg-[#2d6a80]" />
                <div className="rounded-lg border border-[#e2eaf0] bg-white p-2.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#2d425a]">
                      {evento.status_anterior
                        ? `${STATUS_ROTULOS[evento.status_anterior]} → ${STATUS_ROTULOS[evento.status_novo]}`
                        : `Criada como ${STATUS_ROTULOS[evento.status_novo]}`}
                    </span>
                    <span className="text-[10px] text-[#7d858d]">
                      {formatarDataHora(evento.data_mudanca)}
                    </span>
                  </div>
                  {evento.justificativa_ou_motivo && (
                    <p className="mt-1 text-[#4f5c66]">{evento.justificativa_ou_motivo}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
