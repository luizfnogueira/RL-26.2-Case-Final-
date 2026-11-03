import type { ReactNode } from 'react'
import type { Kpi, KpiInadimplencia } from '@/types/dashboard'
import { formatarPercentual } from '@/utils/formatacao'
import { formatarPeriodo } from '@/utils/periodos'
import { valorExecutivo } from './indicadores'

type Props = { kpi: Kpi | KpiInadimplencia }

const percentual = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

/** "rótulo | valor": o rótulo pode quebrar; o valor nunca ("R$" de um lado e o número do outro). */
function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0">{rotulo}</dt>
      <dd className="shrink-0 text-right font-medium whitespace-nowrap text-ink tabular-nums">
        {children}
      </dd>
    </div>
  )
}

/** Um termo da fórmula: a linha pode quebrar entre os termos, nunca dentro de um número. */
function Termo({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>
}

/**
 * Origem da comparação de um KPI: os dois períodos, os valores de cada um e a conta que produziu
 * a variação. Os números vêm prontos da API; aqui só se formata.
 */
export default function DetalheComparacao({ kpi }: Props) {
  const variacao = kpi.variacao_percentual.valor
  const atual = valorExecutivo(kpi.atual, true)
  const comparado = valorExecutivo(kpi.comparacao, true)
  const inadimplencia = 'percentual_receita_atual' in kpi ? kpi : null

  return (
    <div className="flex flex-col gap-4 text-corpo text-ink-2">
      <dl className="flex flex-col gap-2">
        <Linha rotulo="Período atual">{formatarPeriodo(kpi.atual.periodo_referencia)}</Linha>
        <Linha rotulo="Período comparado">
          {formatarPeriodo(kpi.comparacao.periodo_referencia)}
        </Linha>
        <Linha rotulo="Valor atual">{atual}</Linha>
        <Linha rotulo="Valor comparado">{comparado}</Linha>
      </dl>

      {inadimplencia && (
        <dl className="flex flex-col gap-2 border-t border-borda-leve pt-3">
          <Linha rotulo="% da receita no período atual">
            {inadimplencia.percentual_receita_atual.valor === null
              ? '—'
              : formatarPercentual(inadimplencia.percentual_receita_atual.valor)}
          </Linha>
          <Linha rotulo="% da receita no período comparado">
            {inadimplencia.percentual_receita_comparacao.valor === null
              ? '—'
              : formatarPercentual(inadimplencia.percentual_receita_comparacao.valor)}
          </Linha>
          <Linha rotulo="Variação em pontos percentuais">
            {inadimplencia.variacao_pontos_percentuais.valor === null
              ? '—'
              : `${percentual.format(inadimplencia.variacao_pontos_percentuais.valor)} p.p.`}
          </Linha>
        </dl>
      )}

      <div className="border-t border-borda-leve pt-3">
        {variacao === null || kpi.atual.valor === null || kpi.comparacao.valor === null ? (
          <p>A variação não é calculada quando um dos valores está ausente ou é zero na base.</p>
        ) : (
          <>
            <p className="text-legenda font-medium">Cálculo</p>
            <p className="mt-1 leading-6 text-ink tabular-nums">
              <Termo>({atual}</Termo> <Termo>− {comparado})</Termo> <Termo>÷ {comparado}</Termo>{' '}
              <Termo>× 100</Termo> <Termo>= {percentual.format(variacao)}%</Termo>
            </p>
          </>
        )}
      </div>

      <p className="text-legenda text-ink-3">
        Valores e variação vêm da API; o portal não recalcula os números.
      </p>
    </div>
  )
}
