import type { OpcoesFiltros, OpcoesFiltrosApi } from '@/types/filtros'

/**
 * Agrupa os pares (chave, valor) devolvidos por `GET /filtros` no formato que a
 * `BarraDeFiltros` usa: bairros e alimentadores indexados pelo município.
 */
function agruparPorMunicipio<T>(
  itens: readonly T[],
  municipio: (item: T) => string,
  valor: (item: T) => string,
): Record<string, string[]> {
  const grupos: Record<string, string[]> = {}
  for (const item of itens) {
    const chave = municipio(item)
    ;(grupos[chave] ??= []).push(valor(item))
  }
  return grupos
}

/**
 * Converte a resposta de `GET /filtros` (valores da Gold, ainda em maiúsculas) no
 * formato da barra. Não altera os valores: quem exibe aplica `formatarNome`.
 */
export function paraOpcoesBarra(opcoes: OpcoesFiltrosApi | null | undefined): OpcoesFiltros {
  if (!opcoes) return {}
  return {
    municipios: opcoes.municipios,
    bairros: agruparPorMunicipio(
      opcoes.bairros,
      (item) => item.municipio,
      (item) => item.bairro,
    ),
    classes: opcoes.classes,
    alimentadores: agruparPorMunicipio(
      opcoes.alimentadores,
      (item) => item.municipio,
      (item) => item.alimentador,
    ),
  }
}
