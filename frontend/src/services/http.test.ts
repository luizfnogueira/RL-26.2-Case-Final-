import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { construirQuery } from './http'

describe('construirQuery', () => {
  it('omite valores vazios e codifica os demais', () => {
    expect(construirQuery({ a: 1, b: undefined, c: null, d: '', e: 'x y', f: false })).toBe(
      '?a=1&e=x+y&f=false',
    )
    expect(construirQuery({ periodo_atual: '2025-07/2026-06' })).toBe(
      '?periodo_atual=2025-07%2F2026-06',
    )
    expect(construirQuery()).toBe('')
    expect(construirQuery({})).toBe('')
  })

  it('repete parâmetros para valores em array', () => {
    expect(construirQuery({ nivel: 'municipio', itens: ['RECIFE', 'OLINDA'] })).toBe(
      '?nivel=municipio&itens=RECIFE&itens=OLINDA',
    )
    expect(
      construirQuery({ itens: ['A', '', undefined, 'B'] as unknown as string[] }),
    ).toBe('?itens=A&itens=B')
  })
})

describe('requisitar com a API real (VITE_USE_MOCKS=false)', () => {
  const fetchFalso = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_USE_MOCKS', 'false')
    vi.stubEnv('VITE_API_URL', 'http://api.teste/')
    vi.stubGlobal('fetch', fetchFalso)
  })

  afterEach(() => {
    fetchFalso.mockReset()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  const resposta = (corpo: unknown, status = 200) =>
    new Response(corpo === undefined ? null : JSON.stringify(corpo), { status })

  it('chama a URL base sem barra dupla, com a query e devolve o JSON', async () => {
    fetchFalso.mockResolvedValue(resposta({ status: 'ok' }))
    const { requisitar } = await import('./http')
    expect(await requisitar('GET', '/health', { params: { a: 1 } })).toEqual({ status: 'ok' })
    expect(fetchFalso).toHaveBeenCalledWith(
      'http://api.teste/health?a=1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('envia o corpo JSON com Content-Type em POST', async () => {
    fetchFalso.mockResolvedValue(resposta({ id_ordem: 5 }, 201))
    const { requisitar } = await import('./http')
    await requisitar('POST', '/inspecoes', { corpo: { id_uc: 'UC-1' } })
    const [, opcoes] = fetchFalso.mock.calls[0]
    expect(opcoes.body).toBe('{"id_uc":"UC-1"}')
    expect(opcoes.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('converte o corpo {codigo, mensagem} de erro em ApiError', async () => {
    fetchFalso.mockResolvedValue(
      resposta({ codigo: 'ORDEM_ATIVA_EXISTENTE', mensagem: 'Já existe.' }, 409),
    )
    const { requisitar } = await import('./http')
    await expect(requisitar('POST', '/inspecoes', { corpo: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      codigo: 'ORDEM_ATIVA_EXISTENTE',
      mensagem: 'Já existe.',
    })
  })

  it('trata falha de rede, erro sem corpo e resposta vazia', async () => {
    const { requisitar } = await import('./http')
    fetchFalso.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(requisitar('GET', '/dashboard')).rejects.toMatchObject({
      status: 0,
      codigo: 'REDE_INDISPONIVEL',
    })
    fetchFalso.mockResolvedValueOnce(new Response('<html>', { status: 502 }))
    await expect(requisitar('GET', '/dashboard')).rejects.toMatchObject({
      status: 502,
      codigo: 'ERRO_INTERNO',
    })
    fetchFalso.mockResolvedValueOnce(resposta(undefined, 200))
    await expect(requisitar('GET', '/dashboard')).rejects.toMatchObject({
      codigo: 'RESPOSTA_INVALIDA',
    })
  })

  it('propaga o cancelamento sem convertê-lo em erro de rede', async () => {
    const abortada = new DOMException('Cancelado', 'AbortError')
    fetchFalso.mockRejectedValue(abortada)
    const controle = new AbortController()
    controle.abort()
    const { requisitar } = await import('./http')
    await expect(requisitar('GET', '/dashboard', { sinal: controle.signal })).rejects.toBe(abortada)
  })
})
