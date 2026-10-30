import { useId, useState } from 'react'
import { ChartNoAxesCombined, Table2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { PontoSerie } from '@/types/dashboard'
import { formatarEnergia, formatarReais } from '@/utils/formatacao'
import { formatarMes } from '@/utils/periodos'
import { AREA, caminhoMensal, escalaMensal, posicaoMes } from './historico'
import { valorExecutivo } from './indicadores'

type Props = { pontos: readonly PontoSerie[] }

export default function HistoricoExecutivo({ pontos }: Props) {
  const id = useId()
  const [tabela, setTabela] = useState(false)
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const ativo = Math.min(selecionado ?? pontos.length - 1, pontos.length - 1)
  const ponto = pontos[ativo]
  const receita = escalaMensal(pontos.map((p) => p.receita.valor))
  const energia = escalaMensal(pontos.map((p) => p.energia.valor))
  const semValores = !pontos.some((p) => p.receita.valor !== null || p.energia.valor !== null)

  return (
    <Card
      titulo="Evolução histórica"
      subtitulo={`Receita faturada e volume de energia · ${pontos.length} meses`}
      acoes={
        <Button
          variante="fantasma"
          tamanho="sm"
          aria-pressed={tabela}
          onClick={() => setTabela(!tabela)}
          icone={tabela ? <ChartNoAxesCombined size={16} /> : <Table2 size={16} />}
        >
          {tabela ? 'Ver gráfico' : 'Ver como tabela'}
        </Button>
      }
    >
      {semValores ? (
        <EmptyState
          titulo="Histórico indisponível"
          descricao="Não há valores mensais para este recorte."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-legenda">
            <ul className="flex gap-5" aria-label="Legenda do histórico">
              <li className="flex items-center gap-2">
                <span className="h-0.5 w-5 bg-teal-escuro" aria-hidden="true" />
                Receita (R$)
              </li>
              <li className="flex items-center gap-2">
                <span
                  className="w-5 border-t-2 border-dashed border-alerta-escuro"
                  aria-hidden="true"
                />
                Volume (kWh)
              </li>
            </ul>
            <p className="text-ink-2">Escalas independentes: R$ à esquerda · kWh à direita</p>
          </div>
          {tabela ? (
            <div className="max-h-80 overflow-auto rounded-md border border-borda-leve">
              <table className="w-full text-left text-corpo">
                <caption className="sr-only">Histórico mensal de receita e volume</caption>
                <thead className="sticky top-0 bg-azul-50">
                  <tr>
                    <th scope="col" className="p-3">
                      Mês
                    </th>
                    <th scope="col" className="p-3">
                      Receita faturada (R$)
                    </th>
                    <th scope="col" className="p-3">
                      Volume (kWh)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pontos.map((p) => (
                    <tr key={p.mes} className="border-t border-borda-leve">
                      <th scope="row" className="p-3 font-normal">
                        {formatarMes(p.mes)}
                      </th>
                      <td className="p-3">{valorExecutivo(p.receita, true)}</td>
                      <td className="p-3">{valorExecutivo(p.energia, true)}</td>
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
                  className="min-w-[600px] w-full"
                  onPointerMove={(evento) => {
                    const caixa = evento.currentTarget.getBoundingClientRect()
                    if (!caixa.width) return
                    const x = ((evento.clientX - caixa.left) / caixa.width) * AREA.largura
                    setSelecionado(
                      Math.max(
                        0,
                        Math.min(
                          pontos.length - 1,
                          Math.round(
                            ((x - AREA.esquerda) / (AREA.direita - AREA.esquerda)) *
                              (pontos.length - 1),
                          ),
                        ),
                      ),
                    )
                  }}
                >
                  <title id={`${id}-titulo`}>
                    Histórico de receita faturada e volume de energia
                  </title>
                  <desc id={`${id}-descricao`}>
                    {pontos.length} meses. Cada série usa sua própria escala, iniciando em zero para
                    valores positivos. Use o seletor de mês ou a visão em tabela para consultar os
                    valores.
                  </desc>
                  {receita.marcas.map((valor, i) => {
                    const y = receita.y(valor)
                    return (
                      <g key={i}>
                        <line
                          x1={AREA.esquerda}
                          x2={AREA.direita}
                          y1={y}
                          y2={y}
                          className="stroke-borda"
                          strokeDasharray="3 6"
                        />
                        <text
                          x={AREA.esquerda - 12}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-teal-profundo text-[11px]"
                        >
                          {formatarReais(valor)}
                        </text>
                        <text
                          x={AREA.direita + 12}
                          y={y + 4}
                          className="fill-alerta-escuro text-[11px]"
                        >
                          {formatarEnergia(energia.marcas[i])}
                        </text>
                      </g>
                    )
                  })}
                  <path
                    d={caminhoMensal(pontos, 'receita', receita.y)}
                    fill="none"
                    className="stroke-teal-escuro"
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                  <path
                    d={caminhoMensal(pontos, 'energia', energia.y)}
                    fill="none"
                    className="stroke-alerta-escuro"
                    strokeWidth="2.5"
                    strokeDasharray="7 4"
                    strokeLinejoin="round"
                  />
                  {pontos.map(
                    (p, i) =>
                      (i === 0 || i === pontos.length - 1 || i % 6 === 0) && (
                        <text
                          key={p.mes}
                          x={posicaoMes(i, pontos.length)}
                          y={AREA.base + 24}
                          textAnchor={
                            i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle'
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
                        x1={posicaoMes(ativo, pontos.length)}
                        x2={posicaoMes(ativo, pontos.length)}
                        y1={AREA.topo}
                        y2={AREA.base}
                        className="stroke-ink-3"
                        strokeDasharray="3 4"
                      />
                      {ponto.receita.valor !== null && (
                        <circle
                          cx={posicaoMes(ativo, pontos.length)}
                          cy={receita.y(ponto.receita.valor)}
                          r="5"
                          className="fill-teal-escuro stroke-white"
                          strokeWidth="2"
                        />
                      )}
                      {ponto.energia.valor !== null && (
                        <circle
                          cx={posicaoMes(ativo, pontos.length)}
                          cy={energia.y(ponto.energia.valor)}
                          r="5"
                          className="fill-alerta-escuro stroke-white"
                          strokeWidth="2"
                        />
                      )}
                    </g>
                  )}
                </svg>
              </div>
              <div className="mt-2 flex flex-col gap-3 rounded-xl bg-surface-sutil px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 text-corpo"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <strong className="font-medium">{ponto && formatarMes(ponto.mes)}</strong>
                  <span className="text-teal-profundo">
                    Receita: {ponto && valorExecutivo(ponto.receita)}
                  </span>
                  <span className="text-alerta-escuro">
                    Volume: {ponto && valorExecutivo(ponto.energia)}
                  </span>
                </p>
                <label className="flex items-center gap-3 text-legenda text-ink-2">
                  Mês em destaque
                  <input
                    type="range"
                    min="0"
                    max={pontos.length - 1}
                    value={ativo}
                    onChange={(e) => setSelecionado(Number(e.target.value))}
                    className="w-28 accent-teal-escuro"
                  />
                </label>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  )
}
