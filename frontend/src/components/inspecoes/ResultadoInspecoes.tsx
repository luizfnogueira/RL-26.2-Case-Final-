import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Skeleton from '@/components/ui/Skeleton'
import { useConsulta } from '@/hooks/useConsulta'
import { buscarIndicadoresOrdens } from '@/services'
import type { ParamsIndicadoresOrdens } from '@/types/inspecoes'
import { formatarEnergia, formatarPercentual } from '@/utils/formatacao'

/** Motivos mostrados no ranking; o resto fica na API. */
const MAX_MOTIVOS = 5

type Props = {
  filtros: ParamsIndicadoresOrdens
  /** Muda quando uma ordem é concluída na tela, para os números acompanharem. */
  versao: number
  className?: string
}

/** "A fila está acertando?": resultado das inspeções concluídas no recorte (Tela 5). */
export default function ResultadoInspecoes({ filtros, versao, className }: Props) {
  const { periodo_conclusao, municipio, bairro, classe, alimentador } = filtros
  const consulta = useConsulta(
    (sinal) =>
      buscarIndicadoresOrdens({ periodo_conclusao, municipio, bairro, classe, alimentador }, sinal),
    [periodo_conclusao, municipio, bairro, classe, alimentador, versao],
  )
  const dados = consulta.dados

  return (
    <Card
      titulo="Resultado das inspeções"
      subtitulo="Quanto das vistorias concluídas encontrou irregularidade"
      aria-busy={consulta.carregando}
      className={className}
    >
      {consulta.erro && !dados ? (
        <ErrorState erro={consulta.erro} aoTentarNovamente={consulta.recarregar} />
      ) : !dados ? (
        <Skeleton className="h-28 w-full rounded-card" />
      ) : dados.concluidas === 0 ? (
        <EmptyState
          titulo="Nenhuma inspeção concluída"
          descricao="A taxa de acerto aparece quando houver vistorias concluídas neste recorte."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-legenda text-ink-2">Taxa de acerto</dt>
              <dd className="text-titulo-lg text-ink">
                {formatarPercentual(dados.taxa_acerto_pct ?? 0)}
              </dd>
              <dd className="text-legenda text-ink-2">
                {dados.com_irregularidade} de {dados.concluidas} encontraram irregularidade
              </dd>
            </div>
            <div>
              <dt className="text-legenda text-ink-2">Energia recuperada</dt>
              <dd className="text-titulo-lg text-ink">{formatarEnergia(dados.kwh_recuperado)}</dd>
              <dd className="text-legenda text-ink-2">
                a fila estimava {formatarEnergia(dados.kwh_estimado)}
              </dd>
            </div>
          </dl>

          <div>
            <h3 className="mb-2 text-legenda text-ink-2">Acerto por motivo da suspeita</h3>
            <ul className="flex flex-col gap-2">
              {dados.por_motivo.slice(0, MAX_MOTIVOS).map((m) => (
                <li key={m.motivo} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-corpo">
                    <span className="min-w-0 truncate text-ink" title={m.motivo}>
                      {m.motivo}
                    </span>
                    <span className="shrink-0 text-ink-2">
                      {formatarPercentual(m.taxa_acerto_pct)} · {m.com_irregularidade}/
                      {m.concluidas}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full bg-surface-alt"
                    role="presentation"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-teal"
                      style={{ width: `${m.taxa_acerto_pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  )
}
