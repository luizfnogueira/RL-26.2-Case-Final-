import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizarErro, type ApiError } from '@/services/erro-api'

interface Estado<R> {
  executando: boolean
  erro: ApiError | null
  resultado: R | null
}

export interface ResultadoAcao<A extends unknown[], R> {
  /** Dispara a ação. Devolve o resultado, ou null se falhou (o erro fica em `erro`). */
  executar: (...args: A) => Promise<R | null>
  executando: boolean
  /** Erro da última execução; limpo ao executar de novo. */
  erro: ApiError | null
  /** Resultado da última execução bem-sucedida. */
  resultado: R | null
  limpar: () => void
}

/**
 * Ação de escrita (POST e PATCH) com estado de envio e erro, para botões e formulários.
 *
 * @example
 * const { executar, executando, erro } = useAcao(criarInspecao)
 * const ordem = await executar({ id_uc, equipe_responsavel })
 * if (ordem) fecharModal()
 */
export function useAcao<A extends unknown[], R>(
  acao: (...args: A) => Promise<R>,
): ResultadoAcao<A, R> {
  const [estado, setEstado] = useState<Estado<R>>({
    executando: false,
    erro: null,
    resultado: null,
  })
  const acaoAtual = useRef(acao)
  useEffect(() => {
    acaoAtual.current = acao
  })

  const executar = useCallback(async (...args: A): Promise<R | null> => {
    setEstado((anterior) => ({ ...anterior, executando: true, erro: null }))
    try {
      const resultado = await acaoAtual.current(...args)
      setEstado({ executando: false, erro: null, resultado })
      return resultado
    } catch (erro) {
      setEstado((anterior) => ({ ...anterior, executando: false, erro: normalizarErro(erro) }))
      return null
    }
  }, [])

  const limpar = useCallback(
    () => setEstado({ executando: false, erro: null, resultado: null }),
    [],
  )

  return {
    executar,
    executando: estado.executando,
    erro: estado.erro,
    resultado: estado.resultado,
    limpar,
  }
}
