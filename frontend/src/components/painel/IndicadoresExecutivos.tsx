import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import type { IndicadoresDashboard } from '@/types/dashboard'
import { formatarPercentual } from '@/utils/formatacao'
import { cx } from '@/utils/cx'
import { ORDEM_KPIS, valorExecutivo } from './indicadores'

type Props = { indicadores: IndicadoresDashboard }

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
        return (
          <Card key={nome} className="min-w-0 p-4!" aria-label={kpi.rotulo}>
            <h3 className="min-h-8 text-corpo text-ink-2">{kpi.rotulo}</h3>
            <p
              className="mt-2 truncate text-numero font-medium tracking-tight"
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
                title="Variação percentual em relação à comparação"
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
              Comparação
              <br />
              <span className="font-normal text-ink">{valorExecutivo(kpi.comparacao)}</span>
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
                    : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(indicadores.inadimplencia.variacao_pontos_percentuais.valor)} p.p.`}
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
          </Card>
        )
      })}
    </div>
  )
}
