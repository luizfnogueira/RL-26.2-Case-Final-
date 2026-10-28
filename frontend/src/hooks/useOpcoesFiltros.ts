import { useEffect, useState } from 'react'
import { buscarFiltros, paraOpcoes } from '@/services/filtros'
import type { OpcoesFiltros } from '@/types/filtros'

// As opções só mudam com uma nova carga da Gold: uma consulta serve todas as telas da sessão.
let cache: Promise<OpcoesFiltros> | null = null

function carregar(): Promise<OpcoesFiltros> {
  cache ??= buscarFiltros()
    .then(paraOpcoes)
    .catch((erro: unknown) => {
      cache = null // a próxima tela que abrir tenta de novo
      throw erro
    })
  return cache
}

/** Apaga o cache (testes). */
export function esquecerOpcoesFiltros(): void {
  cache = null
}

/**
 * Opções da BarraDeFiltros e do SeletorDeItens, vindas de GET /filtros.
 * Enquanto carrega ou se a consulta falhar, devolve listas vazias: a tela segue funcionando
 * com "Todos" e os filtros já presentes na URL continuam valendo.
 */
export function useOpcoesFiltros(): OpcoesFiltros {
  const [opcoes, setOpcoes] = useState<OpcoesFiltros>({})
  useEffect(() => {
    let ativo = true
    carregar().then(
      (valor) => ativo && setOpcoes(valor),
      () => {},
    )
    return () => {
      ativo = false
    }
  }, [])
  return opcoes
}
