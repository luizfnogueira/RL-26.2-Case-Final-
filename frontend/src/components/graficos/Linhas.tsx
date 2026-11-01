import { useState } from 'react'
import type { GraficoIA } from '@/types/ia'
import { cx } from '@/utils/cx'
import { CLASSE_TOOLTIP, corDaSerie, useLargura, type Formatos } from './comum'
import { escalaDasLinhas } from './geometria'

type Props = { grafico: GraficoIA; formatos: Formatos; descricao: string }

/**
 * Linhas em SVG (Nastengraph, "Line charts best practices"): só para tempo, da esquerda para a
 * direita, proporção perto de 16:9, até 4 linhas com o nome escrito no fim de cada uma (sem
 * legenda à parte) e mês sem dado como buraco na linha, nunca ligado.
 */
export default function Linhas({ grafico, formatos, descricao }: Props) {
  const { caixa, largura } = useLargura()
  const [ativo, setAtivo] = useState<number | null>(null)
  const n = grafico.series.length
  const altura = Math.round(Math.min(300, Math.max(200, (largura * 9) / 16)))
  // À esquerda cabe "R$ 26,0 mi"; à direita, metade do último mês (ou o nome das linhas)
  const margem = { esq: 72, dir: n > 1 ? 96 : 32, topo: 16, base: 32 }
  const presentes = grafico.series.flatMap((s) => s.valores.filter((v): v is number => v !== null))
  const marcas = escalaDasLinhas(presentes, n)
  const [inicio, fim] = [marcas[0], marcas[marcas.length - 1]]
  const pontos = grafico.categorias.length
  const larguraPlot = largura - margem.esq - margem.dir
  const alturaPlot = altura - margem.topo - margem.base
  const x = (i: number) => margem.esq + (pontos === 1 ? larguraPlot / 2 : (larguraPlot * i) / (pontos - 1))
  const y = (valor: number) => margem.topo + alturaPlot * (1 - (valor - inicio) / (fim - inicio))
  const salto = Math.max(1, Math.ceil(pontos / Math.max(1, Math.floor(larguraPlot / 64))))
  const faixa = larguraPlot / Math.max(1, pontos - 1)

  // Mês sem dado (null) interrompe a linha: cada trecho contínuo vira um "M ... L ..."
  const caminho = (valores: (number | null)[]) =>
    valores
      .map((v, i) => (v === null ? null : `${i === 0 || valores[i - 1] === null ? 'M' : 'L'}${x(i)},${y(v)}`))
      .filter(Boolean)
      .join(' ')

  // Nome no fim de cada linha, empilhado sem sobrepor
  const finais = grafico.series
    .map((serie, k) => {
      const ultimo = serie.valores.reduce<number>((achado, v, i) => (v === null ? achado : i), -1)
      return { serie, k, ultimo, y: ultimo < 0 ? 0 : y(serie.valores[ultimo] as number) }
    })
    .filter((f) => f.ultimo >= 0)
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < finais.length; i++) finais[i].y = Math.max(finais[i].y, finais[i - 1].y + 14)

  return (
    <div ref={caixa} className="relative w-full">
      <svg width={largura} height={altura} role="group" aria-label={descricao} className="block max-w-full">
        {marcas.map((marca) => (
          <g key={marca}>
            <line
              x1={margem.esq}
              x2={largura - margem.dir}
              y1={y(marca)}
              y2={y(marca)}
              className={marca === 0 ? 'stroke-borda' : 'stroke-borda-leve'}
              strokeWidth={1}
            />
            <text x={margem.esq - 8} y={y(marca)} dy="0.32em" textAnchor="end" className="fill-ink-2 text-legenda">
              {marca === 0 ? '0' : formatos.valor(marca)}
            </text>
          </g>
        ))}
        {/* Um rótulo a cada `salto` meses, sempre alinhado a uma marca (nunca dois encostados no fim) */}
        {grafico.categorias.map((categoria, i) =>
          i % salto === 0 ? (
            <text key={categoria} x={x(i)} y={altura - margem.base + 18} textAnchor="middle" className="fill-ink-2 text-legenda">
              {formatos.categoria(categoria)}
            </text>
          ) : null,
        )}
        {ativo !== null && (
          <line x1={x(ativo)} x2={x(ativo)} y1={margem.topo} y2={altura - margem.base} className="stroke-ink-3" strokeWidth={1} />
        )}
        {grafico.series.map((serie, k) => {
          const cor = corDaSerie(serie.nome, k, n)
          return (
            <g key={serie.nome}>
              <path d={caminho(serie.valores)} fill="none" className={cor.traco} strokeWidth={2.5} strokeLinejoin="round" />
              {pontos <= 24 &&
                serie.valores.map((v, i) =>
                  v === null ? null : (
                    <circle key={i} cx={x(i)} cy={y(v)} r={ativo === i ? 4 : 2.5} className={cor.preenchimento} />
                  ),
                )}
            </g>
          )
        })}
        {n > 1 &&
          finais.map((f) => (
            <text
              key={`fim-${f.serie.nome}`}
              x={x(f.ultimo) + 8}
              y={f.y}
              dy="0.32em"
              className={cx('text-legenda font-medium', corDaSerie(f.serie.nome, f.k, n).preenchimento)}
            >
              {formatos.serie(f.serie.nome)}
            </text>
          ))}
        {grafico.categorias.map((categoria, i) => (
          <rect
            key={`alvo-${categoria}`}
            x={x(i) - faixa / 2}
            y={margem.topo}
            width={faixa}
            height={alturaPlot}
            fill="transparent"
            tabIndex={0}
            role="img"
            aria-label={`${formatos.categoria(categoria)}: ${grafico.series
              .map((s) => `${n > 1 ? `${formatos.serie(s.nome)} ` : ''}${s.valores[i] === null ? 'sem dado' : formatos.valorCompleto(s.valores[i] as number)}`)
              .join(', ')}`}
            onPointerEnter={() => setAtivo(i)}
            onPointerLeave={() => setAtivo(null)}
            onFocus={() => setAtivo(i)}
            onBlur={() => setAtivo(null)}
            className="outline-none"
          />
        ))}
      </svg>
      {ativo !== null && (
        <div
          role="status"
          className={cx(CLASSE_TOOLTIP, '-translate-x-1/2')}
          style={{ left: Math.min(Math.max(x(ativo), 90), largura - 90), top: 0 }}
        >
          <p className="text-legenda opacity-80">{formatos.categoria(grafico.categorias[ativo])}</p>
          {grafico.series.map((serie) => (
            <p key={serie.nome} className="text-corpo font-medium">
              {n > 1 && `${formatos.serie(serie.nome)}: `}
              {serie.valores[ativo] === null ? 'sem dado' : formatos.valorCompleto(serie.valores[ativo] as number)}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
