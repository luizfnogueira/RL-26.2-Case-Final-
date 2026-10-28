import type { OpcoesFiltros, RespostaFiltros } from '@/types/filtros'
import { requisitar } from './http'

/** GET /filtros: municípios, bairros, classes e alimentadores aceitos pelos filtros. */
export function buscarFiltros(sinal?: AbortSignal): Promise<RespostaFiltros> {
  return requisitar<RespostaFiltros>('GET', '/filtros', { sinal })
}

/** Resposta da API → formato das listas suspensas (bairros agrupados por município). */
export function paraOpcoes(resposta: RespostaFiltros): OpcoesFiltros {
  const bairros: Record<string, string[]> = {}
  for (const { municipio, bairro } of resposta.bairros) {
    ;(bairros[municipio] ??= []).push(bairro)
  }
  return {
    municipios: resposta.municipios,
    bairros,
    classes: resposta.classes,
    alimentadores: resposta.alimentadores.map((a) => a.alimentador),
  }
}
