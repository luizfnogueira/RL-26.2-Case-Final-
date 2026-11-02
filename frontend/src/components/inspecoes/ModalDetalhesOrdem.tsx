import { CheckCircle2, History } from 'lucide-react'
import Badge, { type VarianteBadge } from '@/components/ui/Badge'
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

function Rotulo({ children }: { children: string }) {
  return <p className="text-micro font-medium tracking-wider text-ink-3 uppercase">{children}</p>
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
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 rounded-md border border-borda-leve bg-surface-alt p-4 sm:grid-cols-4">
          <div>
            <Rotulo>Status atual</Rotulo>
            <div className="mt-1.5">
              <Badge variante={STATUS_VARIANTES[ordem.status]} ponto>
                {STATUS_ROTULOS[ordem.status]}
              </Badge>
            </div>
          </div>
          <div>
            <Rotulo>Equipe</Rotulo>
            <p className="mt-1.5 text-corpo font-medium text-ink">{ordem.equipe_responsavel}</p>
          </div>
          <div>
            <Rotulo>Data criação</Rotulo>
            <p className="mt-1.5 text-corpo text-ink-2">{formatarData(ordem.data_criacao)}</p>
          </div>
          <div>
            <Rotulo>Previsão</Rotulo>
            <p className="mt-1.5 text-corpo text-ink-2">{formatarData(ordem.data_prevista)}</p>
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-legenda font-semibold tracking-wider text-ink uppercase">
            Contexto da fiscalização
          </h3>
          <div className="flex flex-col gap-2 rounded-md border border-borda-leve bg-surface-card p-4 text-corpo">
            <div className="flex items-start justify-between gap-4">
              <span className="text-ink-2">Motivo</span>
              <span className="text-right font-medium text-ink">{ordem.motivo ?? '—'}</span>
            </div>
            {ordem.kwh_estimado !== null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-ink-2">Estimativa de recuperação</span>
                <span className="font-semibold text-teal-profundo">
                  {formatarEnergia(ordem.kwh_estimado)}
                </span>
              </div>
            )}
            {ordem.observacoes && (
              <div className="mt-1 border-t border-borda-leve pt-2">
                <p className="mb-1 text-ink-2">Observações da ordem</p>
                <p className="whitespace-pre-wrap text-ink">{ordem.observacoes}</p>
              </div>
            )}
          </div>
        </section>

        {ordem.status === 'CONCLUIDA' && ordem.resultado && (
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-legenda font-semibold tracking-wider text-ink uppercase">
              <CheckCircle2 size={14} aria-hidden="true" className="text-sucesso-texto" />
              Resultado da vistoria técnica
            </h3>
            <div className="flex flex-col gap-2 rounded-md border border-sucesso-texto/25 bg-sucesso-suave/50 p-4 text-corpo">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-ink">Irregularidade</span>
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
                <div className="flex items-center justify-between gap-4">
                  <span className="text-ink-2">Energia recuperada</span>
                  <span className="text-corpo-lg font-semibold text-perigo-escuro">
                    {formatarEnergia(ordem.resultado.kwh_recuperado)}
                  </span>
                </div>
              )}

              {ordem.resultado.inspetor && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-ink-2">Inspetor responsável</span>
                  <span className="font-medium text-ink">{ordem.resultado.inspetor}</span>
                </div>
              )}

              {ordem.resultado.data_inspecao && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-ink-2">Data da vistoria</span>
                  <span className="text-ink">
                    {formatarDataHora(ordem.resultado.data_inspecao)}
                  </span>
                </div>
              )}

              <div className="mt-1 border-t border-sucesso-texto/15 pt-2">
                <span className="mb-1 block text-ink-2">Laudo / Observações</span>
                <p className="whitespace-pre-wrap text-ink">{ordem.resultado.observacoes}</p>
              </div>
            </div>
          </section>
        )}

        {ordem.status === 'CANCELADA' && (
          <section className="flex flex-col gap-2">
            <h3 className="text-legenda font-semibold tracking-wider text-perigo-escuro uppercase">
              Motivo do cancelamento
            </h3>
            <div className="flex flex-col gap-1 rounded-md border border-perigo/25 bg-perigo-suave/60 p-4 text-corpo">
              <p className="font-medium text-ink">
                {ordem.justificativa_cancelamento || 'Sem justificativa informada.'}
              </p>
              {ordem.data_cancelamento && (
                <p className="text-legenda text-ink-2">
                  Cancelada em {formatarDataHora(ordem.data_cancelamento)}
                </p>
              )}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-legenda font-semibold tracking-wider text-ink uppercase">
            <History size={14} aria-hidden="true" />
            Histórico de alterações ({historicoOrdenado.length})
          </h3>
          <div className="relative flex flex-col gap-3 pl-4 before:absolute before:top-2 before:bottom-2 before:left-1.5 before:w-0.5 before:bg-borda">
            {historicoOrdenado.map((evento) => (
              <div key={evento.id_historico} className="relative text-corpo">
                <span className="absolute top-3 -left-[14px] size-2 rounded-full border-2 border-surface-card bg-teal" />
                <div className="rounded-md border border-borda-leve bg-surface-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      {evento.status_anterior
                        ? `${STATUS_ROTULOS[evento.status_anterior]} → ${STATUS_ROTULOS[evento.status_novo]}`
                        : `Criada como ${STATUS_ROTULOS[evento.status_novo]}`}
                    </span>
                    <span className="text-micro text-ink-3">
                      {formatarDataHora(evento.data_mudanca)}
                    </span>
                  </div>
                  {evento.justificativa_ou_motivo && (
                    <p className="mt-1 text-ink-2">{evento.justificativa_ou_motivo}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  )
}
