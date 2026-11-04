import { ArrowRight, Info } from 'lucide-react'
import { useState } from 'react'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { EtapaCascata } from '@/components/graficos/geometria'
import type { Dashboard, PonteReceita } from '@/types/dashboard'
import { cx } from '@/utils/cx'
import { formatarPercentual, formatarReais, formatarReaisCompleto } from '@/utils/formatacao'
import { formatarPeriodo } from '@/utils/periodos'
import { etapasDaPonte, variacaoDaReceita } from './explicacao'

type Props = {
  dashboard: Dashboard
  /** Atualizando com filtros novos: mantém o conteúdo anterior, esmaecido. */
  atualizando?: boolean
}

type LinhaEfeito = { id: string; rotulo: string; detalhe: string; valor: number; total?: boolean }

/** Barra que sai do centro: para a direita quando soma, para a esquerda quando subtrai. */
function BarraDivergente({
  valor,
  escala,
  total,
}: {
  valor: number
  escala: number
  total?: boolean
}) {
  const largura = escala === 0 ? 0 : (Math.abs(valor) / escala) * 50
  return (
    <div className="relative h-6" aria-hidden="true">
      <div className="absolute inset-y-0 left-1/2 w-px bg-borda" />
      <div
        className={cx(
          'absolute inset-y-1 rounded-sm',
          total ? 'bg-ink-3' : valor >= 0 ? 'bg-teal' : 'bg-perigo',
          valor >= 0 ? 'left-1/2' : 'right-1/2',
        )}
        style={{ width: `${largura}%` }}
      />
    </div>
  )
}

/** Os dois totais em destaque e, embaixo, quanto cada efeito somou ou tirou. */
function Decomposicao({ etapas, ponte }: { etapas: EtapaCascata[]; ponte: PonteReceita }) {
  const [base, preco, volume, atual] = etapas.map((e) => e.valor)
  const linhas: LinhaEfeito[] = [
    { id: 'preco', rotulo: 'Efeito-preço', detalhe: 'mudança da tarifa média', valor: preco },
    {
      id: 'volume',
      rotulo: 'Efeito-volume',
      detalhe: 'mudança do consumo faturado',
      valor: volume,
    },
    {
      id: 'total',
      rotulo: 'Variação total',
      detalhe: 'preço + volume',
      valor: atual - base,
      total: true,
    },
  ]
  const escala = Math.max(...linhas.map((l) => Math.abs(l.valor)))
  const [comoTabela, setComoTabela] = useState(false)

  const tabela = (
    <table className="w-full border-collapse text-corpo">
      <caption className="sr-only">
        Receita de energia: da base ao valor atual, com efeito-preço e efeito-volume
      </caption>
      <thead className="bg-azul-100 text-left">
        <tr>
          <th scope="col" className="px-3 py-2 font-medium first:rounded-l-md">
            Etapa
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium last:rounded-r-md">
            Valor
          </th>
        </tr>
      </thead>
      <tbody>
        {etapas.map((etapa) => (
          <tr key={etapa.id} className="border-b border-borda-leve last:border-b-0">
            <th scope="row" className="px-3 py-2 text-left font-normal">
              {etapa.rotulo}
            </th>
            <td className="px-3 py-2 text-right tabular-nums">
              {etapa.tipo === 'variacao' && etapa.valor > 0 ? '+' : ''}
              {formatarReaisCompleto(etapa.valor)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          aria-pressed={comoTabela}
          onClick={() => setComoTabela((v) => !v)}
          className="rounded-full px-3 py-1 text-legenda text-teal-escuro hover:bg-azul-50"
        >
          {comoTabela ? 'Ver gráfico' : 'Ver como tabela'}
        </button>
      </div>
      {comoTabela ? (
        tabela
      ) : (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md bg-surface-alt p-4">
            <div className="min-w-0">
              <dt className="text-legenda text-ink-2">
                Receita base ·{' '}
                {formatarPeriodo(ponte.receita_energia_comparacao.periodo_referencia)}
              </dt>
              <dd
                className="text-titulo-lg font-semibold whitespace-nowrap text-ink tabular-nums"
                title={formatarReaisCompleto(base)}
              >
                {formatarReais(base)}
              </dd>
            </div>
            <ArrowRight size={20} aria-hidden="true" className="text-ink-3" />
            <div className="min-w-0 text-right">
              <dt className="text-legenda text-ink-2">
                Receita atual · {formatarPeriodo(ponte.receita_energia_atual.periodo_referencia)}
              </dt>
              <dd
                className="text-titulo-lg font-semibold whitespace-nowrap text-ink tabular-nums"
                title={formatarReaisCompleto(atual)}
              >
                {formatarReais(atual)}
              </dd>
            </div>
          </dl>

          <div>
            <div className="mb-2 flex justify-between text-legenda text-ink-3">
              <span>O que explica a diferença</span>
              <span aria-hidden="true">← tirou · somou →</span>
            </div>
            <ul className="flex flex-col">
              {linhas.map((linha) => (
                <li
                  key={linha.id}
                  className={cx(
                    'grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 py-2',
                    linha.total && 'mt-1 border-t border-borda-leve pt-3',
                  )}
                >
                  <div className="min-w-0">
                    <p className={cx('text-corpo text-ink', linha.total && 'font-semibold')}>
                      {linha.rotulo}
                    </p>
                    <p className="text-legenda text-ink-3">{linha.detalhe}</p>
                  </div>
                  <BarraDivergente valor={linha.valor} escala={escala} total={linha.total} />
                  <p
                    className={cx(
                      'min-w-20 text-right text-corpo font-semibold whitespace-nowrap tabular-nums',
                      linha.total
                        ? 'text-ink'
                        : linha.valor >= 0
                          ? 'text-teal-escuro'
                          : 'text-perigo',
                    )}
                  >
                    {formatarReais(linha.valor, { sinal: true })}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Da receita base à atual: os dois totais em destaque e, embaixo, quanto cada efeito somou ou tirou,
 * em barras que saem do zero (centro). A variação total fecha a conta: preço + volume.
 */
export default function PonteDaReceita({ dashboard, atualizando }: Props) {
  const etapas = etapasDaPonte(dashboard)
  const variacao = variacaoDaReceita(dashboard)
  const motivo = dashboard.metadados.observacoes.at(-1)

  return (
    <Card
      titulo="Ponte da receita"
      subtitulo="Quanto o preço e o volume somaram ou tiraram da receita de energia"
      acoes={
        variacao !== null && (
          <Badge variante={variacao >= 0 ? 'sucesso' : 'perigo'}>
            {formatarPercentual(variacao, { sinal: true })} total
          </Badge>
        )
      }
      className={cx('h-full transition-opacity', atualizando && 'opacity-70')}
    >
      {etapas ? (
        <Decomposicao etapas={etapas} ponte={dashboard.ponte_receita} />
      ) : (
        <EmptyState
          titulo="Decomposição indisponível para este recorte"
          descricao={
            motivo ??
            'A Gold só decompõe a receita entre as janelas padrão e sem filtro de alimentador.'
          }
        />
      )}
      <p className="mt-3 flex items-start gap-1.5 text-legenda text-ink-2">
        <Info size={14} aria-hidden="true" className="mt-px shrink-0" />
        Receita de energia, sem tributos. Por isso difere da receita faturada do painel executivo,
        que inclui tributos.
      </p>
    </Card>
  )
}
