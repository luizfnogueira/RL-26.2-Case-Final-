import { useEffect, useRef, useState } from 'react'
import { cx } from '@/utils/cx'
import { formatarPercentual } from '@/utils/formatacao'
import { caminhoBarra, marcasDoEixo, posicaoDica, tetoDoEixo } from './geometria'

/** Um ponto do eixo (ex.: um mês): valor atual e valor de comparação, lado a lado. */
export interface PontoComparado {
  id: string
  /** Rótulo curto no eixo ("Jun"). */
  rotulo: string
  /** Segunda linha opcional do eixo ("2026"), só onde ajuda a ler o ano. */
  rotuloSecundario?: string
  /** Descrição completa para leitores de tela e tooltip ("Jun/2026"). */
  rotuloCompleto: string
  atual: number | null
  anterior: number | null
  /** Marca de texto sob o eixo (ex.: "estimada"); a cor nunca carrega isso sozinha. */
  aviso?: string | null
  /** O aviso por extenso, no tooltip e para leitores de tela (ex.: "Leitura estimada"). */
  avisoCompleto?: string | null
}

type Props = {
  pontos: readonly PontoComparado[]
  nomeAtual: string
  nomeAnterior: string
  /** Valor curto, para as marcas do eixo ("1,2 MWh"). */
  formatarValor: (valor: number) => string
  /** Valor completo, para o tooltip e leitores de tela ("1.234,5 kWh"). */
  formatarValorCompleto: (valor: number) => string
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
// Transições curtas do foco; desligadas para quem pede menos movimento.
const TRANSICAO = 'duration-150 motion-reduce:transition-none'

const ALTURA = 260
const MARGEM = { esq: 64, dir: 8, topo: 22, base: 48 }
const LARGURA_MAX_BARRA = 24
const ESPACO_PAR = 2 // espaço na cor do fundo entre as duas barras do mês

/** Variação do atual sobre o anterior, em pontos percentuais; null sem os dois valores > 0. */
function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || atual <= 0 || anterior <= 0) return null
  return ((atual - anterior) / anterior) * 100
}

/**
 * Linha do tooltip: valor em destaque e o nome da série depois (o leitor já sabe a série e quer o
 * número), com a chave em traço na cor da barra. Sem amostra, o recuo mantém os valores alinhados.
 */
function LinhaDica({ valor, nome, amostra }: { valor: string; nome: string; amostra?: string }) {
  return (
    <p className="mt-1 flex items-center gap-2">
      <span className={cx('h-1 w-3 shrink-0 rounded-full', amostra)} />
      <span className="text-corpo font-medium tabular-nums">{valor}</span>
      <span className="text-legenda opacity-80">{nome}</span>
    </p>
  )
}

/**
 * Barras agrupadas em SVG: em cada ponto, o valor de comparação (claro) ao lado do atual (escuro),
 * na mesma escala. Valor ausente não vira barra zero: o ponto fica vazio, com "sem dado" quando
 * faltam os dois. Nenhuma barra leva rótulo de valor: o tooltip (mouse e teclado), o eixo e a
 * tabela carregam os números.
 */
export default function BarrasComparadas({
  pontos,
  nomeAtual,
  nomeAnterior,
  formatarValor,
  formatarValorCompleto,
  descricao,
  legendaAviso,
  className,
}: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(560)
  const [ativo, setAtivo] = useState<number | null>(null)

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
  const inicio = (i: number) => MARGEM.esq + faixa * i
  const centro = (i: number) => inicio(i) + faixa / 2
  const baseY = y(0)
  const valorOuSemDado = (valor: number | null) =>
    valor === null ? 'sem dado' : formatarValorCompleto(valor)

  const barra = (valor: number | null, x: number, cor: string, serie: string) =>
    valor === null || valor <= 0 ? null : (
      <path
        d={caminhoBarra(x, y(valor), larguraBarra, baseY - y(valor))}
        className={cor}
        data-serie={serie}
      />
    )

  const emFoco = ativo === null ? null : pontos[ativo]
  const variacaoEmFoco = emFoco && variacao(emFoco.atual, emFoco.anterior)

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
                {marca === 0 ? '0' : formatarValor(marca)}
              </text>
            </g>
          ))}

          {pontos.map((p, i) => {
            const inicioPar = centro(i) - larguraBarra - ESPACO_PAR / 2
            const semDado = p.atual === null && p.anterior === null
            const v = variacao(p.atual, p.anterior)
            const partes = [
              p.rotuloCompleto,
              `${nomeAtual}: ${valorOuSemDado(p.atual)}`,
              `${nomeAnterior}: ${valorOuSemDado(p.anterior)}`,
              v === null ? null : `Variação: ${formatarPercentual(v, { sinal: true })}`,
              p.avisoCompleto ?? p.aviso ?? null,
            ].filter(Boolean)
            return (
              <g
                key={p.id}
                tabIndex={0}
                role="img"
                aria-label={partes.join('; ')}
                data-ponto={p.id}
                onPointerEnter={() => setAtivo(i)}
                onPointerLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                className="outline-none focus-visible:[&>rect:first-child]:stroke-teal-escuro"
              >
                {/* Área de toque e faixa de fundo do mês em foco: a faixa inteira, maior que as barras. */}
                <rect
                  x={inicio(i)}
                  y={0}
                  width={faixa}
                  height={ALTURA}
                  rx={4}
                  stroke="none"
                  strokeWidth={2}
                  data-faixa={ativo === i ? 'ativa' : undefined}
                  className={cx(
                    'transition-colors',
                    TRANSICAO,
                    ativo === i ? 'fill-azul-50' : 'fill-transparent',
                  )}
                />
                {/* Com um mês em foco, as barras dos outros ficam levemente apagadas. */}
                <g
                  className={cx(
                    'transition-opacity',
                    TRANSICAO,
                    ativo !== null && ativo !== i && 'opacity-60',
                  )}
                >
                  {barra(p.anterior, inicioPar, COR_ANTERIOR, 'anterior')}
                  {barra(p.atual, inicioPar + larguraBarra + ESPACO_PAR, COR_ATUAL, 'atual')}
                </g>
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

        {emFoco && ativo !== null && (
          // Mesmo conteúdo do aria-label do mês em foco, que o leitor de tela já anuncia.
          <div
            aria-hidden="true"
            data-dica
            className={cx(
              'pointer-events-none absolute z-10 rounded-md bg-surface-tinta px-3 py-2 text-ink-inverso shadow-flutuante',
              'transition-opacity starting:opacity-0',
              TRANSICAO,
            )}
            style={{
              top: MARGEM.topo,
              ...posicaoDica(inicio(ativo), inicio(ativo) + faixa, largura),
            }}
          >
            <p className="text-legenda opacity-80">{emFoco.rotuloCompleto}</p>
            <LinhaDica
              valor={valorOuSemDado(emFoco.atual)}
              nome={nomeAtual}
              amostra={AMOSTRA_ATUAL}
            />
            <LinhaDica
              valor={valorOuSemDado(emFoco.anterior)}
              nome={nomeAnterior}
              amostra={AMOSTRA_ANTERIOR}
            />
            {variacaoEmFoco !== null && (
              <LinhaDica
                valor={formatarPercentual(variacaoEmFoco, { sinal: true })}
                nome="Variação"
              />
            )}
            {emFoco.avisoCompleto && (
              <p className="mt-1 pl-5 text-legenda text-alerta-suave">{emFoco.avisoCompleto}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
