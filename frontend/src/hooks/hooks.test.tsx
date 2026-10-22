import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/erro-api'
import { useAcao } from './useAcao'
import { useConsulta } from './useConsulta'

/** Promessa que o teste resolve ou rejeita na hora que quiser. */
function adiada<T>() {
  let resolver!: (valor: T) => void
  let rejeitar!: (erro: unknown) => void
  const promessa = new Promise<T>((res, rej) => {
    resolver = res
    rejeitar = rej
  })
  return { promessa, resolver, rejeitar }
}

describe('useConsulta', () => {
  it('começa carregando e entrega os dados', async () => {
    const consulta = vi.fn(async () => 'ok')
    const { result } = renderHook(() => useConsulta(consulta, ['a']))
    expect(result.current).toMatchObject({ carregando: true, dados: null, erro: null })
    await waitFor(() => expect(result.current.carregando).toBe(false))
    expect(result.current).toMatchObject({ dados: 'ok', erro: null })
  })

  it('descarta a resposta antiga quando os filtros mudam no meio da consulta', async () => {
    const lenta = adiada<string>()
    const rapida = adiada<string>()
    const respostas: Record<string, Promise<string>> = {
      antigo: lenta.promessa,
      novo: rapida.promessa,
    }
    const sinais: AbortSignal[] = []
    const { result, rerender } = renderHook(
      ({ filtro }) =>
        useConsulta(
          (sinal) => {
            sinais.push(sinal)
            return respostas[filtro]
          },
          [filtro],
        ),
      { initialProps: { filtro: 'antigo' } },
    )

    rerender({ filtro: 'novo' })
    expect(sinais[0].aborted).toBe(true)
    await act(async () => rapida.resolver('dados novos'))
    await waitFor(() => expect(result.current.dados).toBe('dados novos'))

    await act(async () => lenta.resolver('dados antigos')) // chega atrasada
    expect(result.current).toMatchObject({ dados: 'dados novos', carregando: false })
  })

  it('mantém o último dado enquanto carrega novos filtros', async () => {
    const segunda = adiada<string>()
    const { result, rerender } = renderHook(
      ({ n }) => useConsulta(() => (n === 1 ? Promise.resolve('um') : segunda.promessa), [n]),
      { initialProps: { n: 1 } },
    )
    await waitFor(() => expect(result.current.dados).toBe('um'))
    rerender({ n: 2 })
    expect(result.current).toMatchObject({ dados: 'um', carregando: true })
    await act(async () => segunda.resolver('dois'))
    await waitFor(() => expect(result.current).toMatchObject({ dados: 'dois', carregando: false }))
  })

  it('expõe o erro padronizado e recarrega com os mesmos parâmetros', async () => {
    const consulta = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError(503, 'DADOS_INDISPONIVEIS', 'Fonte fora do ar.'))
      .mockResolvedValueOnce('recuperou')
    const { result } = renderHook(() => useConsulta(consulta, []))
    await waitFor(() => expect(result.current.erro).not.toBeNull())
    expect(result.current.erro).toMatchObject({ status: 503, codigo: 'DADOS_INDISPONIVEIS' })
    expect(result.current.dados).toBeNull()

    act(() => result.current.recarregar())
    await waitFor(() => expect(result.current.dados).toBe('recuperou'))
    expect(result.current.erro).toBeNull()
    expect(consulta).toHaveBeenCalledTimes(2)
  })

  it('converte erros genéricos em ApiError', async () => {
    const { result } = renderHook(() => useConsulta(() => Promise.reject(new Error('quebrou')), []))
    await waitFor(() => expect(result.current.erro).toBeInstanceOf(ApiError))
    expect(result.current.erro?.mensagem).toBe('quebrou')
  })

  it('não consulta quando está desabilitada', () => {
    const consulta = vi.fn(async () => 'x')
    const { result } = renderHook(() => useConsulta(consulta, [], { habilitada: false }))
    expect(consulta).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ carregando: false, dados: null })
  })

  it('cancela a consulta ao desmontar a tela', () => {
    let sinal!: AbortSignal
    const { unmount } = renderHook(() =>
      useConsulta((s) => {
        sinal = s
        return new Promise<string>(() => {})
      }, []),
    )
    unmount()
    expect(sinal.aborted).toBe(true)
  })
})

describe('useAcao', () => {
  it('marca executando e devolve o resultado', async () => {
    const pendente = adiada<string>()
    const { result } = renderHook(() =>
      useAcao((n: number) => pendente.promessa.then((v) => `${v}${n}`)),
    )
    let retorno: Promise<string | null>
    act(() => {
      retorno = result.current.executar(7)
    })
    expect(result.current.executando).toBe(true)
    await act(async () => pendente.resolver('ordem '))
    expect(await retorno!).toBe('ordem 7')
    expect(result.current).toMatchObject({ executando: false, erro: null, resultado: 'ordem 7' })
  })

  it('devolve null e guarda o erro quando a ação falha, e limpa depois', async () => {
    const erro = new ApiError(409, 'ORDEM_ATIVA_EXISTENTE', 'Já existe.')
    const { result } = renderHook(() => useAcao(() => Promise.reject(erro)))
    let retorno: string | null = 'x'
    await act(async () => {
      retorno = await result.current.executar()
    })
    expect(retorno).toBeNull()
    expect(result.current.erro).toBe(erro)
    expect(result.current.executando).toBe(false)
    act(() => result.current.limpar())
    expect(result.current.erro).toBeNull()
  })
})
