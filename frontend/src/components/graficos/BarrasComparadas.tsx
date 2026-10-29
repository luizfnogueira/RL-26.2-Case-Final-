import { useEffect, useRef, useState } from 'react'
import { cx } from '@/utils/cx'
import { caminhoBarra, marcasDoEixo, tetoDoEixo } from './geometria'

/** Um ponto do eixo (ex.: um mês): valor atual e valor de comparação, lado a lado. */
export interface PontoComparado {
  id: string
  /** Rótulo curto no eixo ("Jun"). */
  rotulo: string
  /** Segunda linha opcional do eixo ("2026"), só onde ajuda a ler o ano. */
  rotuloSecundario?: string
  /** Descrição completa para leitores de tela ("Jun/2026"). */
  rotuloCompleto: string
  atual: number | null
  anterior: number | null
  /** Marca de texto sob o eixo (ex.: "estimada"); a cor nunca carrega isso sozinha. */
  aviso?: string | null
}

type Props = {
  pontos: readonly PontoComparado[]
  nomeAtual: string
  nomeAnterior: string
  /** Valor curto, para o eixo e o rótulo da barra ("412 kWh"). */
  formatarValor: (valor: number) => string
  /** Frase que resume o gráfico para leitores de tela. */
  descricao: string
  /** Explica o `aviso` na legenda (ex.: "estimada: leitura estimada"). */
  legendaAviso?: string
  className?: string
}

// Tokens do @theme (validação de daltonismo registrada no index.css). O atual é o mais escuro
// (destaque); o anterior, o mais claro.
const COR_ATUAL = 'fill-grafico-atual'
const COR_ANTERIOR = 'fill-grafico-anterior'
const AMOSTRA_ATUAL = 'bg-grafico-atual'
const AMOSTRA_ANTERIOR = 'bg-grafico-anterior'

const ALTURA = 260
const MARGEM = { esq: 64, dir: 8, topo: 22, base: 48 }
const LARGURA_MAX_BARRA = 24
const ESPACO_PAR = 2 // espaço na cor do fundo entre as duas barras do mês
const ROTULO_MEIO = 36 // meia largura aproximada de "1.234 kWh" em text-legenda

/**
 * Barras agrupadas em SVG: em cada ponto, o valor de comparação (claro) ao lado do atual (escuro),
 * na mesma escala. Valor ausente não vira barra zero: o ponto fica vazio, com "sem dado" quando
 * faltam os dois. Só o último valor atual leva rótulo; o eixo e a tabela carregam o resto.
 */
export default function BarrasComparadas({
  pontos,
  nomeAtual,
  nomeAnterior,
  formatarValor,
  descricao,
  legendaAviso,
  className,
}: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(560)

  useEffect(() => {
    const elemento = caixa.current
    if (!elemento || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(([entrada]) =>
      setLargura(Math.max(280, Math.round(entrada.contentRect.width))),
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  const valores = pontos
    .flatMap((p) => [p.atual, p.anterior])
    .filter((v): v is number => v !== null)
  const teto = tetoDoEixo(Math.max(0, ...valores))
  const larguraPlot = largura - MARGEM.esq - MARGEM.dir
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base
  const faixa = larguraPlot / Math.max(1, pontos.length)
  const larguraBarra = Math.min(LARGURA_MAX_BARRA, Math.max(4, (faixa * 0.7 - ESPACO_PAR) / 2))
  const y = (valor: number) => MARGEM.topo + alturaPlot * (1 - valor / teto)
  const centro = (i: number) => MARGEM.esq + faixa * (i + 0.5)
  const baseY = y(0)
  // Último ponto com valor atual: o único que leva rótulo na barra (findLastIndex é ES2023).
  const ultimoComValor = pontos.reduce((ultimo, p, i) => (p.atual !== null ? i : ultimo), -1)

  const barra = (valor: number | null, x: number, cor: string, serie: string) =>
    valor === null || valor <= 0 ? null : (
      <path
        d={caminhoBarra(x, y(valor), larguraBarra, baseY - y(valor))}
        className={cor}
        data-serie={serie}
      />
    )

  return (
    <div className={className}>
      <ul
        aria-label="Legenda"
        className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-legenda text-ink-2"
      >
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cx('size-2.5 rounded-xs', AMOSTRA_ANTERIOR)} />
          {nomeAnterior}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cx('size-2.5 rounded-xs', AMOSTRA_ATUAL)} />
          {nomeAtual}
        </li>
        {legendaAviso && <li>{legendaAviso}</li>}
      </ul>

      <div ref={caixa} className="w-full">
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
                {marca === 0 ? '0' : formatarValor(marca)}
              </text>
            </g>
          ))}

          {pontos.map((p, i) => {
            const inicioPar = centro(i) - larguraBarra - ESPACO_PAR / 2
            const semDado = p.atual === null && p.anterior === null
            const partes = [
              p.rotuloCompleto,
              `${nomeAtual}: ${p.atual === null ? 'sem dado' : formatarValor(p.atual)}`,
              `${nomeAnterior}: ${p.anterior === null ? 'sem dado' : formatarValor(p.anterior)}`,
              p.aviso ?? null,
            ].filter(Boolean)
            return (
              <g key={p.id} role="img" aria-label={partes.join('; ')} data-ponto={p.id}>
                {barra(p.anterior, inicioPar, COR_ANTERIOR, 'anterior')}
                {barra(p.atual, inicioPar + larguraBarra + ESPACO_PAR, COR_ATUAL, 'atual')}
                {semDado && (
                  <text
                    x={centro(i)}
                    y={baseY - 8}
                    textAnchor="middle"
                    className="fill-ink-3 text-legenda"
                  >
                    sem dado
                  </text>
                )}
                {i === ultimoComValor && p.atual !== null && (
                  // Perto da borda direita, alinha o rótulo pela direita da barra para não cortar.
                  <text
                    x={
                      centro(i) + ROTULO_MEIO > largura - MARGEM.dir
                        ? inicioPar + larguraBarra * 2 + ESPACO_PAR
                        : inicioPar + larguraBarra * 1.5 + ESPACO_PAR
                    }
                    y={y(p.atual) - 6}
                    textAnchor={centro(i) + ROTULO_MEIO > largura - MARGEM.dir ? 'end' : 'middle'}
                    className="fill-ink text-legenda font-medium"
                  >
                    {formatarValor(p.atual)}
                  </text>
                )}
                <text
                  x={centro(i)}
                  y={baseY + 16}
                  textAnchor="middle"
                  className="fill-ink-2 text-legenda"
                >
                  {p.rotulo}
                  {p.rotuloSecundario && (
                    <tspan x={centro(i)} dy={14}>
                      {p.rotuloSecundario}
                    </tspan>
                  )}
                </text>
                {p.aviso && (
                  <text
                    x={centro(i)}
                    y={baseY + (p.rotuloSecundario ? 44 : 30)}
                    textAnchor="middle"
                    className="fill-alerta-escuro text-legenda"
                  >
                    {p.aviso}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
