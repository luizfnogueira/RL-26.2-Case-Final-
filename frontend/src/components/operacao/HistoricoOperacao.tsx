import { useId, useState } from 'react'
import { ChartNoAxesCombined, Table2 } from 'lucide-react'
import { AREA, escalaMensal, posicaoMes } from '@/components/painel/historico'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { SerieAlimentador } from '@/types/operacao'
import { formatarMes } from '@/utils/periodos'
import {
  caminhoContinuidade,
  numeroOperacao,
  SEM_CRITICO,
  type IndicadorHistorico,
} from './formatacao'

export default function HistoricoOperacao({
  serie,
  indicador,
  aoMudarIndicador,
}: {
  serie: SerieAlimentador
  indicador: IndicadorHistorico
  aoMudarIndicador: (indicador: IndicadorHistorico) => void
}) {
  const id = useId()
  const [tabela, setTabela] = useState(false)
  const [indice, setIndice] = useState<number | null>(null)
  const pontos = serie.pontos
  const semCritico = SEM_CRITICO[indicador]
  const valores = pontos.map((p) => p[indicador].valor)
  const expurgados = pontos.map((p) => p[semCritico].valor)
  const escala = escalaMensal([...valores, ...expurgados])
  const x = (i: number) =>
    pontos.length === 1 ? (AREA.esquerda + AREA.direita) / 2 : posicaoMes(i, pontos.length)
  const ativo = Math.min(indice ?? pontos.length - 1, pontos.length - 1)
  const ponto = pontos[ativo]
  const unidade = indicador === 'dec' ? 'h/UC' : 'interrupções/UC'
  const semDados = ![...valores, ...expurgados].some((v) => v !== null)
  return (
    <Card
      titulo="Histórico por alimentador"
      subtitulo={`${serie.alimentador} · ${pontos.length} meses · ${unidade}`}
      acoes={
        <Button
          variante="fantasma"
          tamanho="sm"
          aria-pressed={tabela}
          onClick={() => setTabela(!tabela)}
          icone={
            tabela ? (
              <ChartNoAxesCombined size={16} aria-hidden="true" />
            ) : (
              <Table2 size={16} aria-hidden="true" />
            )
          }
        >
          {tabela ? 'Ver gráfico' : 'Ver como tabela'}
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Indicador do histórico"
          className="inline-flex gap-1 rounded-full bg-surface-sutil p-1"
        >
          {(['dec', 'fec'] as const).map((nome) => (
            <Button
              key={nome}
              variante={indicador === nome ? 'primario' : 'fantasma'}
              tamanho="sm"
              aria-pressed={indicador === nome}
              onClick={() => aoMudarIndicador(nome)}
            >
              {nome.toUpperCase()}
            </Button>
          ))}
        </div>
        <ul
          className="flex flex-wrap gap-4 text-legenda text-ink-2"
          aria-label="Legenda da continuidade"
        >
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-5 bg-teal-escuro" aria-hidden="true" />
            Com dias críticos
          </li>
          <li className="flex items-center gap-2">
            <span
              className="w-5 border-t-2 border-dashed border-alerta-escuro"
              aria-hidden="true"
            />
            Sem dias críticos
          </li>
        </ul>
      </div>
      {semDados ? (
        <EmptyState
          titulo="Histórico indisponível"
          descricao="A fonte não informou os valores desse indicador para o alimentador."
        />
      ) : tabela ? (
        <div className="max-h-80 overflow-auto rounded-md border border-borda-leve">
          <table className="w-full text-left text-corpo">
            <caption className="sr-only">
              Histórico de {indicador.toUpperCase()} de {serie.alimentador}
            </caption>
            <thead className="sticky top-0 bg-azul-50">
              <tr>
                <th scope="col" className="p-3">
                  Mês
                </th>
                <th scope="col" className="p-3">
                  Com dias críticos ({unidade})
                </th>
                <th scope="col" className="p-3">
                  Sem dias críticos ({unidade})
                </th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.mes} className="border-t border-borda-leve">
                  <th scope="row" className="p-3 font-normal">
                    {formatarMes(p.mes)}
                  </th>
                  <td className="p-3">{numeroOperacao(p[indicador].valor)}</td>
                  <td className="p-3">{numeroOperacao(p[semCritico].valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <svg
              role="img"
              aria-labelledby={`${id}-titulo ${id}-descricao`}
              viewBox={`0 0 ${AREA.largura} ${AREA.altura}`}
              className="min-w-[560px] w-full"
              onPointerMove={(e) => {
                const caixa = e.currentTarget.getBoundingClientRect()
                if (!caixa.width || pontos.length < 2) return
                const posicao = ((e.clientX - caixa.left) / caixa.width) * AREA.largura
                setIndice(
                  Math.max(
                    0,
                    Math.min(
                      pontos.length - 1,
                      Math.round(
                        ((posicao - AREA.esquerda) / (AREA.direita - AREA.esquerda)) *
                          (pontos.length - 1),
                      ),
                    ),
                  ),
                )
              }}
            >
              <title id={`${id}-titulo`}>
                Evolução mensal de {indicador.toUpperCase()} de {serie.alimentador}
              </title>
              <desc id={`${id}-descricao`}>
                Comparação com e sem dias críticos, na mesma escala em {unidade}. Ausências
                interrompem a linha. Os valores também estão disponíveis em tabela.
              </desc>
              {escala.marcas.map((valor, i) => (
                <g key={i}>
                  <line
                    x1={AREA.esquerda}
                    x2={AREA.direita}
                    y1={escala.y(valor)}
                    y2={escala.y(valor)}
                    className="stroke-borda"
                    strokeDasharray="3 6"
                  />
                  <text
                    x={AREA.esquerda - 12}
                    y={escala.y(valor) + 4}
                    textAnchor="end"
                    className="fill-ink-2 text-[11px]"
                  >
                    {numeroOperacao(valor)}
                  </text>
                </g>
              ))}
              <path
                d={caminhoContinuidade(valores, x, escala.y)}
                fill="none"
                className="stroke-teal-escuro"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <path
                d={caminhoContinuidade(expurgados, x, escala.y)}
                fill="none"
                className="stroke-alerta-escuro"
                strokeWidth="2.5"
                strokeDasharray="7 4"
                strokeLinejoin="round"
              />
              {pontos.map(
                (p, i) =>
                  (i === 0 ||
                    i === pontos.length - 1 ||
                    i % Math.max(1, Math.ceil(pontos.length / 8)) === 0) && (
                    <text
                      key={p.mes}
                      x={x(i)}
                      y={AREA.base + 24}
                      textAnchor={
                        pontos.length === 1
                          ? 'middle'
                          : i === 0
                            ? 'start'
                            : i === pontos.length - 1
                              ? 'end'
                              : 'middle'
                      }
                      className="fill-ink-2 text-[11px]"
                    >
                      {formatarMes(p.mes)}
                    </text>
                  ),
              )}
              {ponto && (
                <g>
                  <line
                    x1={x(ativo)}
                    x2={x(ativo)}
                    y1={AREA.topo}
                    y2={AREA.base}
                    className="stroke-ink-3"
                    strokeDasharray="3 4"
                  />
                  {ponto[indicador].valor !== null && (
                    <circle
                      cx={x(ativo)}
                      cy={escala.y(ponto[indicador].valor!)}
                      r="5"
                      className="fill-teal-escuro stroke-white"
                      strokeWidth="2"
                    />
                  )}
                  {ponto[semCritico].valor !== null && (
                    <circle
                      cx={x(ativo)}
                      cy={escala.y(ponto[semCritico].valor!)}
                      r="5"
                      className="fill-alerta-escuro stroke-white"
                      strokeWidth="2"
                    />
                  )}
                </g>
              )}
            </svg>
          </div>
          {ponto && (
            <div className="mt-2 flex flex-col gap-3 rounded-xl bg-surface-sutil px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                aria-live="polite"
                aria-atomic="true"
                className="flex flex-wrap gap-x-4 gap-y-1 text-corpo"
              >
                <strong className="font-medium">{formatarMes(ponto.mes)}</strong>
                <span className="text-teal-profundo">
                  {indicador.toUpperCase()}: {numeroOperacao(ponto[indicador].valor)} {unidade}
                </span>
                <span className="text-alerta-escuro">
                  Sem dias críticos: {numeroOperacao(ponto[semCritico].valor)} {unidade}
                </span>
              </p>
              <label className="flex items-center gap-3 text-legenda text-ink-2">
                Mês em destaque
                <input
                  type="range"
                  min="0"
                  max={pontos.length - 1}
                  value={ativo}
                  onChange={(e) => setIndice(Number(e.target.value))}
                  className="w-28 accent-teal-escuro"
                />
              </label>
            </div>
          )}
        </>
      )}
      {!semDados && expurgados.every((v) => v === null) && (
        <p className="mt-4 text-legenda text-ink-2">
          A fonte não disponibiliza este indicador sem dias críticos. O valor ausente é mostrado
          como “—”.
        </p>
      )}
    </Card>
  )
}
