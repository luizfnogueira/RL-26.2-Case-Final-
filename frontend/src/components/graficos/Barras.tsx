import { useState } from 'react'
import type { GraficoIA } from '@/types/ia'
import { cx } from '@/utils/cx'
import { CLASSE_TOOLTIP, corDaSerie, dominioComZero, useLargura, type Formatos } from './comum'
import { marcasDoEixo, quebrarRotulo, tetoDoEixo } from './geometria'

type Props = { grafico: GraficoIA; formatos: Formatos; descricao: string }

/**
 * Barras em SVG (Nastengraph, "Bar charts best practices"): eixo a partir do zero, sem cantos
 * arredondados, valor escrito direto na barra, horizontais para categorias e verticais para
 * períodos. A ordem já vem do backend (maior → menor, ou P1 → P2 e meses).
 */
export default function Barras({ grafico, formatos, descricao }: Props) {
  return grafico.orientacao === 'vertical' ? (
    <BarrasVerticais grafico={grafico} formatos={formatos} descricao={descricao} />
  ) : (
    <BarrasHorizontais grafico={grafico} formatos={formatos} descricao={descricao} />
  )
}

function Legenda({ grafico, formatos }: { grafico: GraficoIA; formatos: Formatos }) {
  if (grafico.series.length < 2) return null
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-legenda text-ink-2">
      {grafico.series.map((serie, i) => (
        <li key={serie.nome} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cx('size-2.5', corDaSerie(serie.nome, i, grafico.series.length).fundo)}
          />
          {formatos.serie(serie.nome)}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({
  grafico,
  indice,
  formatos,
  esquerda,
  topo,
}: {
  grafico: GraficoIA
  indice: number
  formatos: Formatos
  esquerda: number
  topo: number
}) {
  return (
    <div role="status" className={cx(CLASSE_TOOLTIP, '-translate-x-1/2')} style={{ left: esquerda, top: topo }}>
      <p className="text-legenda opacity-80">{formatos.categoria(grafico.categorias[indice])}</p>
      {grafico.series.map((serie) => (
        <p key={serie.nome} className="text-corpo font-medium">
          {grafico.series.length > 1 && `${formatos.serie(serie.nome)}: `}
          {serie.valores[indice] === null ? '—' : formatos.valorCompleto(serie.valores[indice] as number)}
        </p>
      ))}
    </div>
  )
}

function BarrasHorizontais({ grafico, formatos, descricao }: Props) {
  const { caixa, largura } = useLargura()
  const [ativo, setAtivo] = useState<number | null>(null)
  const n = grafico.series.length
  const alturaBarra = n === 1 ? 18 : 12
  const alturaGrupo = n * alturaBarra + (n - 1) * 2
  const passo = alturaGrupo + 12
  const larguraRotulo = Math.min(150, Math.round(largura * 0.36))
  const espacoValor = 84
  const altura = grafico.categorias.length * passo + 8
  const [minimo, maximo] = dominioComZero(grafico.series.flatMap((s) => s.valores))
  const inicio = larguraRotulo + 8
  const larguraPlot = Math.max(40, largura - inicio - espacoValor)
  const x = (valor: number) => inicio + ((valor - minimo) / (maximo - minimo)) * larguraPlot
  const caracteres = Math.max(8, Math.floor(larguraRotulo / 6.6))

  return (
    <div ref={caixa} className="relative w-full">
      <Legenda grafico={grafico} formatos={formatos} />
      <svg width={largura} height={altura} role="group" aria-label={descricao} className="block max-w-full">
        <line x1={x(0)} x2={x(0)} y1={0} y2={altura - 4} className="stroke-borda" strokeWidth={1} />
        {grafico.categorias.map((categoria, i) => {
          const topo = 4 + i * passo
          const rotulo = formatos.categoria(categoria)
          const curto = rotulo.length > caracteres ? `${rotulo.slice(0, caracteres - 1)}…` : rotulo
          return (
            <g
              key={categoria}
              tabIndex={0}
              role="img"
              aria-label={`${rotulo}: ${grafico.series
                .map((s) => `${n > 1 ? `${formatos.serie(s.nome)} ` : ''}${s.valores[i] === null ? 'sem dado' : formatos.valorCompleto(s.valores[i] as number)}`)
                .join(', ')}`}
              onPointerEnter={() => setAtivo(i)}
              onPointerLeave={() => setAtivo(null)}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
              className="outline-none"
            >
              <rect x={0} y={topo - 4} width={largura} height={passo} fill="transparent" />
              <text
                x={larguraRotulo}
                y={topo + alturaGrupo / 2}
                dy="0.32em"
                textAnchor="end"
                className="fill-ink text-legenda"
              >
                {curto}
              </text>
              {grafico.series.map((serie, k) => {
                const valor = serie.valores[i]
                if (valor === null) return null
                const y = topo + k * (alturaBarra + 2)
                const de = Math.min(x(0), x(valor))
                const ate = Math.max(x(0), x(valor))
                return (
                  <g key={serie.nome}>
                    <rect
                      x={de}
                      y={y}
                      width={Math.max(1, ate - de)}
                      height={alturaBarra}
                      className={cx(corDaSerie(serie.nome, k, n).preenchimento, ativo !== null && ativo !== i && 'opacity-60')}
                    />
                    <text
                      x={valor < 0 ? de - 4 : ate + 4}
                      y={y + alturaBarra / 2}
                      dy="0.32em"
                      textAnchor={valor < 0 ? 'end' : 'start'}
                      className="fill-ink text-legenda tabular-nums"
                    >
                      {formatos.valor(valor)}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      {ativo !== null && (
        <Tooltip
          grafico={grafico}
          indice={ativo}
          formatos={formatos}
          esquerda={Math.min(Math.max(larguraRotulo + 90, 100), largura - 100)}
          topo={(grafico.series.length > 1 ? 24 : 0) + ativo * passo - 8}
        />
      )}
    </div>
  )
}

const ALTURA_VERTICAL = 260
const LARGURA_MAX_BARRA = 44

function BarrasVerticais({ grafico, formatos, descricao }: Props) {
  const { caixa, largura } = useLargura()
  const [ativo, setAtivo] = useState<number | null>(null)
  const n = grafico.series.length
  const quantidade = grafico.categorias.length
  const faixaEstimada = (largura - 16) / Math.max(1, quantidade)
  // Valor escrito na barra quando cabe; se não couber, o eixo com linhas de grade volta
  const comRotulos = faixaEstimada / n >= 40
  const margem = { esq: comRotulos ? 8 : 56, dir: 8, topo: 24, base: 40 }
  const larguraPlot = largura - margem.esq - margem.dir
  const alturaPlot = ALTURA_VERTICAL - margem.topo - margem.base
  const faixa = larguraPlot / Math.max(1, quantidade)
  const larguraBarra = Math.min(LARGURA_MAX_BARRA, (faixa * 0.7) / n)
  const [minimo, maximoBruto] = dominioComZero(grafico.series.flatMap((s) => s.valores))
  const maximo = comRotulos ? maximoBruto : tetoDoEixo(maximoBruto)
  const y = (valor: number) => margem.topo + alturaPlot * (1 - (valor - minimo) / (maximo - minimo))
  const centro = (i: number) => margem.esq + faixa * (i + 0.5)
  const salto = Math.max(1, Math.ceil(quantidade / Math.max(1, Math.floor(larguraPlot / 52))))

  return (
    <div ref={caixa} className="relative w-full">
      <Legenda grafico={grafico} formatos={formatos} />
      <svg width={largura} height={ALTURA_VERTICAL} role="group" aria-label={descricao} className="block max-w-full">
        {!comRotulos &&
          marcasDoEixo(maximo).map((marca) => (
            <g key={marca}>
              <line
                x1={margem.esq}
                x2={largura - margem.dir}
                y1={y(marca)}
                y2={y(marca)}
                className="stroke-borda-leve"
                strokeWidth={1}
              />
              <text x={margem.esq - 8} y={y(marca)} dy="0.32em" textAnchor="end" className="fill-ink-2 text-legenda">
                {marca === 0 ? '0' : formatos.valor(marca)}
              </text>
            </g>
          ))}
        <line
          x1={margem.esq}
          x2={largura - margem.dir}
          y1={y(0)}
          y2={y(0)}
          className="stroke-borda"
          strokeWidth={1}
        />
        {grafico.categorias.map((categoria, i) => (
          <g
            key={categoria}
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
          >
            <rect x={margem.esq + faixa * i} y={0} width={faixa} height={ALTURA_VERTICAL} fill="transparent" />
            {grafico.series.map((serie, k) => {
              const valor = serie.valores[i]
              if (valor === null) return null
              const esquerda = centro(i) - (n * larguraBarra) / 2 + k * larguraBarra
              const topo = Math.min(y(0), y(valor))
              return (
                <g key={serie.nome}>
                  <rect
                    x={esquerda}
                    y={topo}
                    width={Math.max(1, larguraBarra - 2)}
                    height={Math.max(1, Math.abs(y(valor) - y(0)))}
                    className={cx(corDaSerie(serie.nome, k, n).preenchimento, ativo !== null && ativo !== i && 'opacity-60')}
                  />
                  {comRotulos && (
                    <text
                      x={esquerda + larguraBarra / 2}
                      y={valor < 0 ? y(valor) + 14 : topo - 6}
                      textAnchor="middle"
                      className="fill-ink text-legenda tabular-nums"
                    >
                      {formatos.valor(valor)}
                    </text>
                  )}
                </g>
              )
            })}
            {i % salto === 0 && (
              <text x={centro(i)} y={ALTURA_VERTICAL - margem.base + 16} textAnchor="middle" className="fill-ink-2 text-legenda">
                {quebrarRotulo(formatos.categoria(categoria), Math.max(8, Math.floor((faixa * salto) / 7))).map(
                  (linha, k) => (
                    <tspan key={linha} x={centro(i)} dy={k === 0 ? 0 : 14}>
                      {linha}
                    </tspan>
                  ),
                )}
              </text>
            )}
          </g>
        ))}
      </svg>
      {ativo !== null && (
        <Tooltip
          grafico={grafico}
          indice={ativo}
          formatos={formatos}
          esquerda={Math.min(Math.max(centro(ativo), 90), largura - 90)}
          topo={(n > 1 ? 24 : 0) + 4}
        />
      )}
    </div>
  )
}
