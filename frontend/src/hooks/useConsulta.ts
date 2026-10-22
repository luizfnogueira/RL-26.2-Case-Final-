import { useEffect, useEffectEvent, useState } from 'react'
import { foiCancelada, normalizarErro, type ApiError } from '@/services/erro-api'

interface Estado<T> {
  /** Chave da última consulta concluída (sucesso ou erro). */
  chave: string | null
  /** Último sucesso, mesmo de uma consulta anterior (permite manter a tela enquanto atualiza). */
  dados: T | null
  /** Erro da consulta identificada por `chave`. */
  erro: ApiError | null
}

export interface ResultadoConsulta<T> {
  /** Último resultado bem-sucedido. Pode ser de filtros anteriores enquanto `carregando` é true. */
  dados: T | null
  /** Erro da consulta atual. Quando existe, mostre o estado de erro em vez de `dados`. */
  erro: ApiError | null
  /** true enquanto a consulta atual não terminou. */
  carregando: boolean
  /** Refaz a consulta com os mesmos parâmetros (botão "Tentar novamente"). */
  recarregar: () => void
}

interface Opcoes {
  /** false adia a consulta (ex.: busca sem código digitado). Padrão true. */
  habilitada?: boolean
}

/**
 * Consulta de leitura com loading, erro e descarte de respostas antigas.
 *
 * - Refaz a consulta quando `dependencias` mudam (filtros, página, id).
 * - Cancela a requisição anterior (AbortSignal) e ignora qualquer resposta que chegue depois
 *   de os filtros terem mudado ou a tela ter sido fechada.
 * - Falha de uma consulta não apaga `dados`: a tela decide entre mostrar erro ou o último dado.
 *
 * Padrão de uso na tela: `carregando && !dados` → esqueleto; `erro` → estado de erro;
 * `dados` → conteúdo (esmaecido se `carregando`).
 *
 * @example
 * const { dados, erro, carregando, recarregar } = useConsulta(
 *   (sinal) => buscarDashboard(params, sinal),
 *   [params],
 * )
 */
export function useConsulta<T>(
  consulta: (sinal: AbortSignal) => Promise<T>,
  dependencias: readonly unknown[],
  { habilitada = true }: Opcoes = {},
): ResultadoConsulta<T> {
  const [estado, setEstado] = useState<Estado<T>>({ chave: null, dados: null, erro: null })
  const [tentativa, setTentativa] = useState(0)

  const chave = `${JSON.stringify(dependencias)}#${tentativa}`
  // Executa sempre a versão mais recente de `consulta`, sem entrar nas dependências do efeito.
  const executar = useEffectEvent((sinal: AbortSignal) => consulta(sinal))

  useEffect(() => {
    if (!habilitada) return
    const controle = new AbortController()
    executar(controle.signal).then(
      (dados) => {
        if (!controle.signal.aborted) setEstado({ chave, dados, erro: null })
      },
      (erro: unknown) => {
        if (controle.signal.aborted || foiCancelada(erro)) return
        setEstado((anterior) => ({ chave, dados: anterior.dados, erro: normalizarErro(erro) }))
      },
    )
    return () => controle.abort()
  }, [chave, habilitada])

  return {
    dados: estado.dados,
    erro: estado.chave === chave ? estado.erro : null,
    carregando: habilitada && estado.chave !== chave,
    recarregar: () => setTentativa((n) => n + 1),
  }
}
