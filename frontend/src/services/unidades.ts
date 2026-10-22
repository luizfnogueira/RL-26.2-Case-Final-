import type { ParamsUnidade, ParamsUnidades, Unidade360, Unidades } from '@/types/unidades'
import { requisitar } from './http'

/** GET /unidades: busca por ID da UC ou titular, com filtros e paginação (Tela 3). */
export function buscarUnidades(params: ParamsUnidades, sinal?: AbortSignal): Promise<Unidades> {
  return requisitar<Unidades>('GET', '/unidades', { params, sinal })
}

/** GET /unidades/{id}: visão 360 da UC (Tela 3). UC inexistente: ApiError 404 UC_INEXISTENTE. */
export function buscarUnidade(
  idUc: string,
  params: ParamsUnidade = {},
  sinal?: AbortSignal,
): Promise<Unidade360> {
  return requisitar<Unidade360>('GET', `/unidades/${encodeURIComponent(idUc)}`, { params, sinal })
}
