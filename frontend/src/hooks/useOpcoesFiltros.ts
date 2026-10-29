import { useMemo } from 'react'
import { buscarFiltros } from '@/services'
import type { ApiError } from '@/services/erro-api'
import type { Metadados } from '@/types/comum'
import type { OpcoesFiltros } from '@/types/filtros'
import { paraOpcoesBarra } from '@/utils/filtros'
import { useConsulta } from './useConsulta'

export interface ResultadoOpcoesFiltros {
  /** Listas prontas para a `BarraDeFiltros` (valores da Gold, sem alterar a caixa). */
  opcoes: OpcoesFiltros
  metadados: Metadados | null
  erro: ApiError | null
  carregando: boolean
}

/**
 * Domínios dos filtros lidos de `GET /filtros`. A tela continua funcionando se a rota
 * falhar: os seletores ficam vazios e a consulta principal segue sem filtro de região.
 */
export function useOpcoesFiltros(): ResultadoOpcoesFiltros {
  const consulta = useConsulta((sinal) => buscarFiltros(sinal), [])
  const opcoes = useMemo(() => paraOpcoesBarra(consulta.dados), [consulta.dados])

  return {
    opcoes,
    metadados: consulta.dados?.metadados ?? null,
    erro: consulta.erro,
    carregando: consulta.carregando,
  }
}
