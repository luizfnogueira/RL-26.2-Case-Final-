import { useState } from 'react'
import type { GraficoIA } from '@/types/ia'
import { cx } from '@/utils/cx'
import { CLASSE_TOOLTIP, COR_OUTROS, CORES_FATIAS, useLargura, type Formatos } from './comum'
import { angulosDasFatias } from './geometria'

type Props = { grafico: GraficoIA; formatos: Formatos; descricao: string }

const umaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
// Abaixo disso, os rótulos em volta da rosca não cabem: viram uma lista na mesma ordem das fatias
const LARGURA_ROTULOS_EM_VOLTA = 420

function ponto(cx: number, cy: number, raio: number, angulo: number) {
  return [cx + raio * Math.cos(angulo), cy + raio * Math.sin(angulo)] as const
}

function fatia(cx: number, cy: number, externo: number, interno: number, de: number, ate: number): string {
  const grande = ate - de > Math.PI ? 1 : 0
  const [x0, y0] = ponto(cx, cy, externo, de)
  const [x1, y1] = ponto(cx, cy, externo, ate)
  const [x2, y2] = ponto(cx, cy, interno, ate)
  const [x3, y3] = ponto(cx, cy, interno, de)
  return `M${x0},${y0} A${externo},${externo} 0 ${grande} 1 ${x1},${y1} L${x2},${y2} A${interno},${interno} 0 ${grande} 0 ${x3},${y3} Z`
}

/**
 * Pizza em forma de rosca (Nastengraph, "Pie charts best practices"): só parte de um todo, até 5
 * fatias da maior para a menor no sentido horário a partir do topo, "Outros" no fim e em cinza,
 * percentual escrito direto na fatia. O backend já garante soma de totais, nunca médias.
 */
export default function Pizza({ grafico, formatos, descricao }: Props) {
  const { caixa, largura } = useLargura()
  const [ativo, setAtivo] = useState<number | null>(null)
  const valores = grafico.series[0].valores.map((v) => v ?? 0)
  const total = valores.reduce((a, b) => a + b, 0)
  const emVolta = largura >= LARGURA_ROTULOS_EM_VOLTA
  const externo = emVolta ? 92 : Math.min(84, Math.round(largura * 0.28))
  const interno = Math.round(externo * 0.58)
  const altura = externo * 2 + (emVolta ? 56 : 16)
  const centroX = largura / 2
  const centroY = altura / 2
  const cor = (i: number) =>
    grafico.categorias[i] === 'Outros' ? COR_OUTROS : CORES_FATIAS[i % CORES_FATIAS.length]
  const pct = (v: number) => `${umaCasa.format((v / total) * 100)}%`

  const fatias = angulosDasFatias(valores, total)

  // Rótulos em volta: cada lado empilhado de cima para baixo, sem sobrepor (16 px entre eles)
  const rotulos = fatias.map((f) => {
    const [x, y] = ponto(centroX, centroY, externo + 18, f.meio)
    return { ...f, x, y, direita: Math.cos(f.meio) >= 0 }
  })
  for (const lado of [true, false]) {
    const doLado = rotulos.filter((r) => r.direita === lado).sort((a, b) => a.y - b.y)
    for (let k = 1; k < doLado.length; k++) doLado[k].y = Math.max(doLado[k].y, doLado[k - 1].y + 16)
  }

  return (
    <div ref={caixa} className="relative w-full">
      <svg width={largura} height={altura} role="group" aria-label={descricao} className="block max-w-full">
        {fatias.map((f) => (
          <path
            key={grafico.categorias[f.i]}
            d={fatia(centroX, centroY, externo, interno, f.de, f.ate)}
            tabIndex={0}
            role="img"
            aria-label={`${formatos.categoria(grafico.categorias[f.i])}: ${pct(f.valor)} (${formatos.valorCompleto(f.valor)})`}
            onPointerEnter={() => setAtivo(f.i)}
            onPointerLeave={() => setAtivo(null)}
            onFocus={() => setAtivo(f.i)}
            onBlur={() => setAtivo(null)}
            className={cx(cor(f.i), 'stroke-surface-card outline-none', ativo !== null && ativo !== f.i && 'opacity-60')}
            strokeWidth={2}
          />
        ))}
        <text x={centroX} y={centroY - 6} textAnchor="middle" className="fill-ink-2 text-legenda">
          Total
        </text>
        <text x={centroX} y={centroY + 12} textAnchor="middle" className="fill-ink text-corpo font-medium">
          {formatos.valor(total)}
        </text>
        {emVolta &&
          rotulos.map((r) => {
            const [lx, ly] = ponto(centroX, centroY, externo + 4, r.meio)
            const xTexto = r.direita ? r.x + 4 : r.x - 4
            return (
              <g key={`rotulo-${grafico.categorias[r.i]}`} aria-hidden="true">
                <polyline points={`${lx},${ly} ${r.x},${r.y} ${xTexto},${r.y}`} fill="none" className="stroke-ink-3" strokeWidth={1} />
                <text x={xTexto + (r.direita ? 2 : -2)} y={r.y} dy="0.32em" textAnchor={r.direita ? 'start' : 'end'} className="fill-ink text-legenda">
                  {formatos.categoria(grafico.categorias[r.i])}{' '}
                  <tspan className="font-medium">{pct(r.valor)}</tspan>
                </text>
              </g>
            )
          })}
      </svg>
      {!emVolta && (
        <ul className="mt-2 flex flex-col gap-1 text-legenda" aria-hidden="true">
          {fatias.map((f) => (
            <li key={grafico.categorias[f.i]} className="flex items-center gap-2">
              <svg width={10} height={10} aria-hidden="true">
                <rect width={10} height={10} className={cor(f.i)} />
              </svg>
              <span className="text-ink">{formatos.categoria(grafico.categorias[f.i])}</span>
              <span className="ml-auto font-medium tabular-nums">{pct(f.valor)}</span>
            </li>
          ))}
        </ul>
      )}
      {ativo !== null && (
        <div role="status" className={cx(CLASSE_TOOLTIP, '-translate-x-1/2')} style={{ left: centroX, top: 4 }}>
          <p className="text-legenda opacity-80">{formatos.categoria(grafico.categorias[ativo])}</p>
          <p className="text-corpo font-medium">
            {pct(valores[ativo])} · {formatos.valorCompleto(valores[ativo])}
          </p>
        </div>
      )}
    </div>
  )
}
