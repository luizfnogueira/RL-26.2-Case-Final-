// Filtros simulados. Saem dos próprios recortes fictícios, e não de filtros.json: assim os nomes
// escolhidos na barra (ex.: Recife) existem nos outros mocks e as telas filtram de verdade.
import type { RespostaFiltros } from '@/types/filtros'
import { fixtures } from './fixtures'

const ordenados = (valores: Iterable<string>) =>
  [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'pt-BR'))

export async function listarFiltros(): Promise<RespostaFiltros> {
  const { recortes } = await fixtures.recortes()
  const bairros = new Map(recortes.map((r) => [`${r.municipio}|${r.bairro}`, r]))
  const alimentadores = new Map(recortes.map((r) => [r.alimentador, r.municipio]))
  return {
    municipios: ordenados(recortes.map((r) => r.municipio)),
    bairros: [...bairros.values()]
      .map(({ municipio, bairro }) => ({ municipio, bairro }))
      .sort(
        (a, b) =>
          a.municipio.localeCompare(b.municipio, 'pt-BR') ||
          a.bairro.localeCompare(b.bairro, 'pt-BR'),
      ),
    classes: ordenados(recortes.map((r) => r.classe)),
    alimentadores: ordenados(alimentadores.keys()).map((alimentador) => ({
      alimentador,
      municipio: alimentadores.get(alimentador)!,
    })),
    metadados: {
      dados_ficticios: true,
      gold_atualizada_em: null,
      observacoes: ['Dados fictícios: os mesmos municípios, bairros e classes dos outros mocks.'],
    },
  }
}
