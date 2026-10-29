import type { OpcoesFiltros } from '@/types/filtros'

export type NivelComparacao = 'municipio' | 'bairro' | 'classe'

/** O que está sendo comparado. `municipio` é o filtro pai, usado só no nível bairro. */
export interface SelecaoItens {
  nivel: NivelComparacao
  municipio?: string
  itens: string[]
}

export const MINIMO_ITENS = 2
export const MAXIMO_ITENS = 4

/** Itens que podem ser escolhidos no nível: no bairro, só os do município escolhido. */
export function itensDisponiveis(opcoes: OpcoesFiltros, selecao: SelecaoItens): readonly string[] {
  switch (selecao.nivel) {
    case 'municipio':
      return opcoes.municipios ?? []
    case 'classe':
      return opcoes.classes ?? []
    case 'bairro': {
      if (!selecao.municipio) return []
      const { bairros } = opcoes
      if (bairros === undefined || Array.isArray(bairros)) return []
      return (bairros as Readonly<Record<string, readonly string[]>>)[selecao.municipio] ?? []
    }
  }
}

/** De 2 a 4 itens, sem repetição, e município escolhido quando o nível é bairro. */
export function selecaoValida(selecao: SelecaoItens): boolean {
  const { itens } = selecao
  return (
    itens.length >= MINIMO_ITENS &&
    itens.length <= MAXIMO_ITENS &&
    new Set(itens).size === itens.length &&
    (selecao.nivel !== 'bairro' || Boolean(selecao.municipio))
  )
}
