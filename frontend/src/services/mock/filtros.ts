import type { OpcoesFiltrosApi } from '@/types/filtros'
import { fixtures } from './fixtures'

/**
 * GET /filtros simulado a partir do mesmo cadastro dos outros mocks (`unidades.json`).
 * Assim os valores listados existem nos dados fictícios, como no backend leem a `dim_uc`.
 */
export async function listarFiltros(): Promise<OpcoesFiltrosApi> {
  const unidades = await fixtures.unidades()
  const municipios = [...new Set(unidades.items.map((uc) => uc.municipio))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
  const bairros = [
    ...new Map(
      unidades.items.map((uc) => [
        `${uc.municipio}|${uc.bairro}`,
        { municipio: uc.municipio, bairro: uc.bairro },
      ]),
    ).values(),
  ].sort(
    (a, b) =>
      a.municipio.localeCompare(b.municipio, 'pt-BR') || a.bairro.localeCompare(b.bairro, 'pt-BR'),
  )
  const classes = [...new Set(unidades.items.map((uc) => uc.classe))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
  const alimentadores = [
    ...new Map(
      unidades.items.map((uc) => [
        uc.alimentador,
        { alimentador: uc.alimentador, municipio: uc.municipio },
      ]),
    ).values(),
  ].sort((a, b) => a.alimentador.localeCompare(b.alimentador, 'pt-BR'))
  return { municipios, bairros, classes, alimentadores, metadados: unidades.metadados }
  return { municipios, bairros, classes, alimentadores, metadados: unidades.metadados }
}
