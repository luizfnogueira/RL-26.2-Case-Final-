import type { OpcoesFiltrosApi } from '@/types/filtros'
import { requisitar } from './http'

/**
 * GET /filtros: municípios, bairros, classes e alimentadores do cadastro de UCs da Gold.
 * Os valores voltam exatamente como estão no banco e são os mesmos enviados nas outras rotas.
 */
export function buscarFiltros(sinal?: AbortSignal): Promise<OpcoesFiltrosApi> {
  return requisitar<OpcoesFiltrosApi>('GET', '/filtros', { sinal })
}
