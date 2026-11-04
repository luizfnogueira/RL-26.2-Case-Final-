import { useEffect, useRef, useState } from 'react'

/** Formatadores que cada gráfico recebe: curto (sobre a barra, no eixo) e completo (tooltip, tabela). */
export interface Formatos {
  valor: (valor: number) => string
  valorCompleto: (valor: number) => string
  categoria: (categoria: string) => string
  /** Nome da série: P1/P2, um indicador ou um nome da Gold (município em maiúsculas). */
  serie: (nome: string) => string
}

/** Largura do contêiner, para o SVG ocupar o balão da conversa (painel estreito ou tela /assistente). */
export function useLargura(minima = 200) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(520)
  useEffect(() => {
    const elemento = caixa.current
    if (!elemento || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(([entrada]) =>
      setLargura(Math.max(minima, Math.round(entrada.contentRect.width))),
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [minima])
  return { caixa, largura }
}

export interface Cor {
  preenchimento: string
  traco: string
  fundo: string
}

// Classes escritas por inteiro: o Tailwind só gera o que encontra literalmente no código.
const PRINCIPAL: Cor = {
  preenchimento: 'fill-teal-escuro',
  traco: 'stroke-teal-escuro',
  fundo: 'bg-teal-escuro',
}
const CORES: Cor[] = [
  PRINCIPAL,
  { preenchimento: 'fill-alerta', traco: 'stroke-alerta-escuro', fundo: 'bg-alerta' },
  {
    preenchimento: 'fill-surface-escuro',
    traco: 'stroke-surface-escuro',
    fundo: 'bg-surface-escuro',
  },
  { preenchimento: 'fill-azul-400', traco: 'stroke-azul-400', fundo: 'bg-azul-400' },
]
// P1 × P2 com as cores de período do portal (as mesmas das BarrasComparadas). Tons do mesmo teal não
// servem: no tema escuro, teal-escuro e azul-400 são a mesma cor e P1 some ao lado de P2.
const ANTERIOR: Cor = {
  preenchimento: 'fill-grafico-anterior',
  traco: 'stroke-grafico-anterior',
  fundo: 'bg-grafico-anterior',
}
const ATUAL: Cor = {
  preenchimento: 'fill-grafico-atual',
  traco: 'stroke-grafico-atual',
  fundo: 'bg-grafico-atual',
}

/** Uma cor por série só quando há mais de uma; P1 e P2 nas cores de período anterior e atual do portal. */
export function corDaSerie(nome: string, indice: number, total: number): Cor {
  if (total === 1) return PRINCIPAL
  if (nome === 'P1') return ANTERIOR
  if (nome === 'P2') return ATUAL
  return CORES[indice % CORES.length]
}

/** Fatias da pizza, da maior para a menor; "Outros" sempre em cinza. */
export const CORES_FATIAS = ['fill-teal-profundo', 'fill-teal', 'fill-azul-400', 'fill-alerta']
export const COR_OUTROS = 'fill-borda'

/** Domínio do eixo de valores que sempre inclui o zero (barras nunca começam fora do zero). */
export function dominioComZero(valores: (number | null)[]): [number, number] {
  const presentes = valores.filter((v): v is number => v !== null)
  const minimo = Math.min(0, ...presentes)
  const maximo = Math.max(0, ...presentes)
  return maximo === minimo ? [minimo, minimo + 1] : [minimo, maximo]
}

/** Tooltip escuro do portal; o texto vem sempre como texto. */
export const CLASSE_TOOLTIP =
  'pointer-events-none absolute z-10 rounded-md bg-surface-tinta px-3 py-2 whitespace-nowrap text-ink-inverso shadow-flutuante'
