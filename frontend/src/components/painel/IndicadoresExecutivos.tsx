import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import type { IndicadoresDashboard } from '@/types/dashboard'
import { cx } from '@/utils/cx'
import { formatarPercentual } from '@/utils/formatacao'
import { formatarPeriodo } from '@/utils/periodos'
import { ORDEM_KPIS, valorExecutivo } from './indicadores'

type Props = { indicadores: IndicadoresDashboard }

const percentual = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

/**
 * Cartões de KPI. Além do valor, da variação e da comparação, cada cartão abre a origem do
 * cálculo: os dois períodos, os valores de cada um e a conta que produziu a variação.
 */
export default function IndicadoresExecutivos({ indicadores }: Props) {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
      aria-label="Seis indicadores executivos"
    >
      {ORDEM_KPIS.map((nome) => {
        const kpi = indicadores[nome]
        const variacao = kpi.variacao_percentual.valor
        const menorMelhor = ['inadimplencia', 'dec_medio', 'fec_medio'].includes(nome)
        const favoravel = variacao !== null && (menorMelhor ? variacao < 0 : variacao > 0)
        const neutra = variacao === null || variacao === 0
        const Seta =
          variacao === null || variacao === 0 ? Minus : variacao > 0 ? ArrowUpRight : ArrowDownRight
        const continuidade = nome === 'dec_medio' || nome === 'fec_medio'
        const motivo = continuidade
          ? 'DEC/FEC indisponíveis para este recorte na fonte consultada.'
          : 'A fonte não informou este valor para o recorte.'
        const periodoAtual = kpi.atual.periodo_referencia
        const periodoComparacao = kpi.comparacao.periodo_referencia

        return (
          <Card key={nome} className="flex min-w-0 flex-col p-4!" aria-label={kpi.rotulo}>
            <h3 className="min-h-8 text-corpo font-medium text-ink-2">{kpi.rotulo}</h3>
            <p
              className="mt-1 truncate text-numero font-semibold tracking-tight text-ink"
              title={kpi.atual.valor === null ? motivo : valorExecutivo(kpi.atual, true)}
            >
              {valorExecutivo(kpi.atual)}
            </p>
            <p className="mt-0.5 min-h-4 text-legenda text-ink-2">
              {nome === 'dec_medio'
                ? 'horas / UC'
                : nome === 'fec_medio'
                  ? 'interrupções / UC'
                  : nome === 'ucs_ativas'
                    ? 'unidades consumidoras'
                    : '\u00a0'}
            </p>
            <div className="mt-3">
              <Badge
                variante={neutra ? 'neutro' : favoravel ? 'sucesso' : 'perigo'}
                title="Variação percentual em relação ao período de comparação"
              >
                <Seta size={13} aria-hidden="true" />
                {variacao === null
                  ? 'Sem comparação'
                  : formatarPercentual(variacao, { sinal: true })}
              </Badge>
            </div>
            <p
              className="mt-3 text-legenda leading-5 text-ink-2"
              title={valorExecutivo(kpi.comparacao, true)}
            >
              Comparação · {formatarPeriodo(periodoComparacao)}
              <br />
              <span className="font-medium text-ink">{valorExecutivo(kpi.comparacao)}</span>
            </p>
            {nome === 'inadimplencia' ? (
              <p className="mt-2 text-legenda leading-4 text-ink-2">
                {indicadores.inadimplencia.percentual_receita_atual.valor === null
                  ? '—'
                  : formatarPercentual(
                      indicadores.inadimplencia.percentual_receita_atual.valor,
                    )}{' '}
                da receita
                <span className="mt-1 block">
                  {indicadores.inadimplencia.variacao_pontos_percentuais.valor === null
                    ? '—'
                    : `${percentual.format(indicadores.inadimplencia.variacao_pontos_percentuais.valor)} p.p.`}
                </span>
              </p>
            ) : (
              <p
                className={cx(
                  'mt-2 text-legenda leading-4',
                  kpi.atual.valor === null ? 'text-ink-2' : 'text-teal-profundo',
                )}
              >
                {kpi.atual.valor === null
                  ? motivo
                  : kpi.diferenca.valor === null
                    ? 'Diferença indisponível'
                    : `Diferença: ${kpi.diferenca.valor > 0 ? '+' : ''}${valorExecutivo(kpi.diferenca)}`}
              </p>
            )}

            <details className="group mt-auto pt-3">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-legenda font-medium text-teal-escuro marker:content-none hover:underline [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className="transition-transform group-open:rotate-180"
                />
                Origem da comparação
              </summary>
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-borda-leve bg-surface-sutil p-2.5 text-legenda leading-4 text-ink-2">
                <dl className="flex flex-col gap-1">
                  <div className="flex justify-between gap-2">
                    <dt>Período atual</dt>
                    <dd className="text-right font-medium text-ink">
                      {formatarPeriodo(periodoAtual)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Período comparado</dt>
                    <dd className="text-right font-medium text-ink">
                      {formatarPeriodo(periodoComparacao)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Valor atual</dt>
                    <dd className="text-right font-medium text-ink">
                      {valorExecutivo(kpi.atual, true)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Valor comparado</dt>
                    <dd className="text-right font-medium text-ink">
                      {valorExecutivo(kpi.comparacao, true)}
                    </dd>
                  </div>
                </dl>
                <p className="border-t border-borda-leve pt-2">
                  {variacao === null || kpi.atual.valor === null || kpi.comparacao.valor === null
                    ? 'A variação não é calculada quando um dos valores está ausente ou é zero na base.'
                    : `Cálculo: (${valorExecutivo(kpi.atual, true)} − ${valorExecutivo(
                        kpi.comparacao,
                        true,
                      )}) ÷ ${valorExecutivo(kpi.comparacao, true)} × 100 = ${percentual.format(
                        variacao,
                      )}%.`}
                </p>
                <p className="text-ink-3">
                  Valores e variação vêm da API; o portal não recalcula os números.
                </p>
              </div>
            </details>
          </Card>
        )
      })}
    </div>
  )
}
