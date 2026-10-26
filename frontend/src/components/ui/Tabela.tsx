import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '@/utils/cx'
import EmptyState from './EmptyState'
import Paginacao, { type PaginacaoProps } from './Paginacao'
import Skeleton from './Skeleton'

export interface Coluna<T> {
  id: string
  cabecalho: string
  celula: (linha: T) => ReactNode
  alinhar?: 'esquerda' | 'centro' | 'direita'
  /** Permite ordenar clicando no cabeçalho. */
  ordenavel?: boolean
  /** Valor usado na ordenação local; sem ele, a coluna só ordena no servidor (`aoOrdenar`). */
  valorOrdenacao?: (linha: T) => string | number | null
  /** Largura CSS opcional (ex.: `8rem`). */
  largura?: string
}

export interface Ordenacao {
  coluna: string
  direcao: 'asc' | 'desc'
}

type Props<T> = {
  colunas: readonly Coluna<T>[]
  linhas: readonly T[]
  chaveLinha: (linha: T) => string | number
  /** Descrição da tabela para leitores de tela (vira o `caption`). */
  legenda: string
  /**
   * Ordenação controlada. Com `aoOrdenar`, a tabela só avisa o clique (o servidor ordena);
   * sem ele, a tabela ordena as linhas recebidas usando `valorOrdenacao`.
   */
  ordenacao?: Ordenacao | null
  aoOrdenar?: (ordenacao: Ordenacao | null) => void
  ordenacaoInicial?: Ordenacao | null
  /** Paginação feita no servidor: `page`, `page_size` e `total` da resposta da API. */
  paginacao?: Omit<PaginacaoProps, 'className'>
  carregando?: boolean
  /** Quantidade de linhas de esqueleto no carregamento inicial. */
  linhasEsqueleto?: number
  /** Conteúdo quando não há linhas; o padrão é um EmptyState. */
  vazio?: ReactNode
  aoClicarLinha?: (linha: T) => void
  className?: string
}

const ALINHAMENTO = { esquerda: 'text-left', centro: 'text-center', direita: 'text-right' }
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Compara na direção `sinal` (1 crescente, -1 decrescente); ausentes ficam sempre no fim. */
function comparar(a: string | number | null, b: string | number | null, sinal: 1 | -1): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  const ordem =
    typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b))
  return sinal * ordem
}

/** Ciclo do clique no cabeçalho: crescente → decrescente → sem ordenação. */
function proximaOrdenacao(atual: Ordenacao | null, coluna: string): Ordenacao | null {
  if (atual?.coluna !== coluna) return { coluna, direcao: 'asc' }
  return atual.direcao === 'asc' ? { coluna, direcao: 'desc' } : null
}

/**
 * Tabela de dados com ordenação, paginação, esqueleto de carregamento e estado vazio.
 * Roda em dois modos: tudo no servidor (`aoOrdenar` + `paginacao`) ou ordenação local nas
 * linhas recebidas. Em telas pequenas, rola na horizontal dentro do cartão.
 */
export default function Tabela<T>({
  colunas,
  linhas,
  chaveLinha,
  legenda,
  ordenacao,
  aoOrdenar,
  ordenacaoInicial = null,
  paginacao,
  carregando = false,
  linhasEsqueleto = 5,
  vazio,
  aoClicarLinha,
  className,
}: Props<T>) {
  const [local, setLocal] = useState<Ordenacao | null>(ordenacaoInicial)
  const ativa = ordenacao !== undefined ? ordenacao : local

  const visiveis = useMemo(() => {
    if (aoOrdenar || !ativa) return linhas
    const coluna = colunas.find((c) => c.id === ativa.coluna)
    if (!coluna?.valorOrdenacao) return linhas
    const valor = coluna.valorOrdenacao
    const sinal = ativa.direcao === 'asc' ? 1 : -1
    return [...linhas].sort((x, y) => comparar(valor(x), valor(y), sinal))
  }, [linhas, colunas, ativa, aoOrdenar])

  function ordenarPor(coluna: string) {
    const proxima = proximaOrdenacao(ativa, coluna)
    if (aoOrdenar) aoOrdenar(proxima)
    else setLocal(proxima)
  }

  function aoTeclarLinha(evento: KeyboardEvent<HTMLTableRowElement>, linha: T) {
    if (evento.target !== evento.currentTarget) return
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault()
      aoClicarLinha?.(linha)
    }
  }

  const semDados = !carregando && visiveis.length === 0

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="overflow-x-auto rounded-md">
        <table className="w-full border-collapse text-corpo" aria-busy={carregando || undefined}>
          <caption className="sr-only">{legenda}</caption>
          <thead className="bg-azul-100 text-ink">
            <tr>
              {colunas.map((coluna) => {
                const emOrdem = ativa?.coluna === coluna.id ? ativa.direcao : null
                const alinhamento = ALINHAMENTO[coluna.alinhar ?? 'esquerda']
                return (
                  <th
                    key={coluna.id}
                    scope="col"
                    style={coluna.largura ? { width: coluna.largura } : undefined}
                    aria-sort={
                      coluna.ordenavel
                        ? emOrdem === 'asc'
                          ? 'ascending'
                          : emOrdem === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                    className={cx(
                      'px-3 py-2.5 font-medium whitespace-nowrap first:rounded-l-md last:rounded-r-md',
                      alinhamento,
                    )}
                  >
                    {coluna.ordenavel ? (
                      <button
                        type="button"
                        onClick={() => ordenarPor(coluna.id)}
                        className={cx(
                          'inline-flex items-center gap-1 rounded-sm font-medium hover:text-teal-profundo',
                          coluna.alinhar === 'direita' && 'flex-row-reverse',
                        )}
                      >
                        {coluna.cabecalho}
                        {emOrdem === 'asc' ? (
                          <ArrowUp size={14} aria-hidden="true" />
                        ) : emOrdem === 'desc' ? (
                          <ArrowDown size={14} aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown size={14} aria-hidden="true" className="text-ink-2" />
                        )}
                      </button>
                    ) : (
                      coluna.cabecalho
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {carregando && visiveis.length === 0
              ? Array.from({ length: linhasEsqueleto }, (_, i) => (
                  <tr key={`esqueleto-${i}`} className="border-b border-borda-leve">
                    {colunas.map((coluna) => (
                      <td key={coluna.id} className="px-3 py-3">
                        <Skeleton className="h-4 w-full max-w-40" />
                      </td>
                    ))}
                  </tr>
                ))
              : visiveis.map((linha) => (
                  <tr
                    key={chaveLinha(linha)}
                    onClick={aoClicarLinha ? () => aoClicarLinha(linha) : undefined}
                    onKeyDown={aoClicarLinha ? (e) => aoTeclarLinha(e, linha) : undefined}
                    tabIndex={aoClicarLinha ? 0 : undefined}
                    className={cx(
                      'border-b border-borda-leve last:border-b-0',
                      aoClicarLinha && 'cursor-pointer hover:bg-azul-50',
                      carregando && 'opacity-60',
                    )}
                  >
                    {colunas.map((coluna) => (
                      <td
                        key={coluna.id}
                        className={cx(
                          'px-3 py-3 align-middle',
                          ALINHAMENTO[coluna.alinhar ?? 'esquerda'],
                        )}
                      >
                        {coluna.celula(linha)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {semDados && (vazio ?? <EmptyState />)}
      {paginacao && paginacao.total > 0 && <Paginacao {...paginacao} />}
    </div>
  )
}
