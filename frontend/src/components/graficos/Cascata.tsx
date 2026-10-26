import { useEffect, useRef, useState } from 'react'
import { cx } from '@/utils/cx'
import {
  calcularBarras,
  marcasDoEixo,
  quebrarRotulo,
  tetoDoEixo,
  type EtapaCascata,
} from './geometria'

type Props = {
  etapas: readonly EtapaCascata[]
  /** Valor curto, usado sobre a barra, no eixo e no tooltip ("R$ 24,7 mi"). */
  formatarValor: (valor: number, etapa?: EtapaCascata) => string
  /** Rótulo curto das marcas do eixo, sem moeda ("250 mi"). Padrão: o mesmo de `formatarValor`. */
  formatarEixo?: (valor: number) => string
  /** Valor completo, usado na visão em tabela e lido por leitores de tela. */
  formatarValorCompleto: (valor: number) => string
  /** Frase que resume o gráfico para leitores de tela. */
  descricao: string
  className?: string
}

const ALTURA = 296
const MARGEM = { esq: 62, dir: 12, topo: 30, base: 58 }
const LARGURA_MAX_BARRA = 44

const COR_BASE = 'fill-marca'
const COR_FINAL = 'fill-surface-escuro'
const COR_AUMENTO = 'fill-teal-escuro'
const COR_REDUCAO = 'fill-perigo'

function corDaEtapa(etapa: EtapaCascata, indice: number): string {
  if (etapa.tipo === 'total') return indice === 0 ? COR_BASE : COR_FINAL
  return etapa.valor >= 0 ? COR_AUMENTO : COR_REDUCAO
}

/**
 * Gráfico em cascata (ponte) em SVG: totais saem do zero e as variações flutuam sobre o acumulado.
 * Eixo a partir do zero, valor sobre cada barra, tooltip por barra (mouse e teclado), legenda e
 * visão em tabela para quem não enxerga o gráfico. O texto vem sempre como texto, nunca como HTML.
 */
export default function Cascata({
  etapas,
  formatarValor,
  formatarEixo = (valor) => formatarValor(valor),
  formatarValorCompleto,
  descricao,
  className,
}: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(560)
  const [ativo, setAtivo] = useState<number | null>(null)
  const [comoTabela, setComoTabela] = useState(false)

  useEffect(() => {
    const elemento = caixa.current
    if (!elemento || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(([entrada]) =>
      setLargura(Math.max(280, Math.round(entrada.contentRect.width))),
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [comoTabela])

  const barras = calcularBarras(etapas)
  const teto = tetoDoEixo(Math.max(...barras.map((b) => b.ate), 0))
  const larguraPlot = largura - MARGEM.esq - MARGEM.dir
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base
  const faixa = larguraPlot / Math.max(1, barras.length)
  const larguraBarra = Math.min(LARGURA_MAX_BARRA, faixa * 0.5)
  const y = (valor: number) => MARGEM.topo + alturaPlot * (1 - valor / teto)
  const centro = (i: number) => MARGEM.esq + faixa * (i + 0.5)

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-legenda text-ink-2">
          {[
            ['Total', 'bg-surface-escuro'],
            ['Aumento', 'bg-teal-escuro'],
            ['Redução', 'bg-perigo'],
          ].map(([rotulo, cor]) => (
            <li key={rotulo} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cx('size-2.5 rounded-xs', cor)} />
              {rotulo}
            </li>
          ))}
        </ul>
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
        <table className="w-full border-collapse text-corpo">
          <caption className="sr-only">{descricao}</caption>
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
                  {formatarValorCompleto(etapa.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={caixa} className="relative w-full">
          <svg
            width={largura}
            height={ALTURA}
            role="group"
            aria-label={descricao}
            className="block max-w-full"
          >
            {marcasDoEixo(teto).map((marca) => (
              <g key={marca}>
                <line
                  x1={MARGEM.esq}
                  x2={largura - MARGEM.dir}
                  y1={y(marca)}
                  y2={y(marca)}
                  className={marca === 0 ? 'stroke-borda' : 'stroke-borda-leve'}
                  strokeWidth={1}
                />
                <text
                  x={MARGEM.esq - 8}
                  y={y(marca)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-ink-2 text-legenda"
                >
                  {marca === 0 ? '0' : formatarEixo(marca)}
                </text>
              </g>
            ))}

            {barras.slice(0, -1).map((barra, i) => (
              <line
                key={`ligacao-${barra.etapa.id}`}
                x1={centro(i) + larguraBarra / 2}
                x2={centro(i + 1) - larguraBarra / 2}
                y1={y(barra.acumulado)}
                y2={y(barra.acumulado)}
                className="stroke-ink-3"
                strokeWidth={1}
              />
            ))}

            {barras.map((barra, i) => {
              const topo = y(barra.ate)
              const altura = Math.max(2, y(barra.de) - topo)
              const apagada = ativo !== null && ativo !== i
              return (
                <g
                  key={barra.etapa.id}
                  tabIndex={0}
                  role="img"
                  aria-label={`${barra.etapa.rotulo}: ${formatarValorCompleto(barra.etapa.valor)}`}
                  onPointerEnter={() => setAtivo(i)}
                  onPointerLeave={() => setAtivo(null)}
                  onFocus={() => setAtivo(i)}
                  onBlur={() => setAtivo(null)}
                  className="outline-none focus-visible:[&>rect:first-child]:stroke-teal-escuro"
                >
                  {/* Área de toque: a faixa inteira, maior que a barra. */}
                  <rect
                    x={MARGEM.esq + faixa * i}
                    y={0}
                    width={faixa}
                    height={ALTURA}
                    fill="transparent"
                    stroke="none"
                    strokeWidth={2}
                  />
                  <rect
                    x={centro(i) - larguraBarra / 2}
                    y={topo}
                    width={larguraBarra}
                    height={altura}
                    rx={4}
                    className={cx(corDaEtapa(barra.etapa, i), apagada && 'opacity-60')}
                  />
                  <text
                    x={centro(i)}
                    y={topo - 8}
                    textAnchor="middle"
                    className="fill-ink text-legenda font-medium"
                  >
                    {formatarValor(barra.etapa.valor, barra.etapa)}
                  </text>
                  <text
                    x={centro(i)}
                    y={ALTURA - MARGEM.base + 18}
                    textAnchor="middle"
                    className="fill-ink-2 text-legenda"
                  >
                    {quebrarRotulo(barra.etapa.rotulo, Math.max(10, Math.floor(faixa / 7))).map(
                      (linha, k) => (
                        <tspan key={linha} x={centro(i)} dy={k === 0 ? 0 : 15}>
                          {linha}
                        </tspan>
                      ),
                    )}
                  </text>
                </g>
              )
            })}
          </svg>

          {ativo !== null && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-surface-tinta px-3 py-2 whitespace-nowrap text-ink-inverso shadow-flutuante"
              style={{
                left: Math.min(Math.max(centro(ativo), 80), largura - 80),
                top: Math.max(y(barras[ativo].ate) - 36, 34),
              }}
            >
              <p className="text-legenda opacity-80">{etapas[ativo].rotulo}</p>
              <p className="text-corpo font-medium">
                {etapas[ativo].tipo === 'variacao' && etapas[ativo].valor > 0 ? '+' : ''}
                {formatarValorCompleto(etapas[ativo].valor)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
