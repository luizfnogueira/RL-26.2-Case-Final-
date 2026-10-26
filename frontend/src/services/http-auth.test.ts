import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAVE_TOKEN, tokenStorage } from '@/auth/tokenStorage'

const fetchFalso = vi.fn()

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status })

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_USE_MOCKS', 'false')
  vi.stubEnv('VITE_API_URL', 'http://api.teste')
  vi.stubGlobal('fetch', fetchFalso)
  window.localStorage.clear()
})

afterEach(() => {
  fetchFalso.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

/** Importa de novo para o http e o gancho compartilharem a mesma instância do módulo. */
async function carregar() {
  const [{ requisitar }, { aoNaoAutorizado }] = await Promise.all([
    import('./http'),
    import('@/auth/naoAutorizado'),
  ])
  return { requisitar, aoNaoAutorizado }
}

const cabecalhosDaChamada = () =>
  fetchFalso.mock.calls[0][1].headers as Record<string, string> | undefined

describe('tokenStorage', () => {
  it('guarda, lê e apaga o token numa única chave', () => {
    expect(tokenStorage.get()).toBeNull()
    tokenStorage.set('abc.def.ghi')
    expect(window.localStorage.getItem(CHAVE_TOKEN)).toBe('abc.def.ghi')
    expect(CHAVE_TOKEN).toBe('venergy_token')
    expect(tokenStorage.get()).toBe('abc.def.ghi')
    tokenStorage.clear()
    expect(tokenStorage.get()).toBeNull()
  })

  it('não quebra quando o localStorage está bloqueado', () => {
    const bloqueado = () => {
      throw new DOMException('Bloqueado', 'SecurityError')
    }
    vi.stubGlobal('localStorage', {
      getItem: bloqueado,
      setItem: bloqueado,
      removeItem: bloqueado,
    })
    expect(tokenStorage.get()).toBeNull()
    expect(() => tokenStorage.set('x')).not.toThrow()
    expect(() => tokenStorage.clear()).not.toThrow()
  })
})

describe('cliente HTTP autenticado', () => {
  it('envia Authorization: Bearer quando há token, também em GET sem corpo', async () => {
    tokenStorage.set('tok-123')
    fetchFalso.mockResolvedValue(resposta({ ok: true }))
    const { requisitar } = await carregar()
    await requisitar('GET', '/dashboard', { params: { periodo_atual: '2025-07/2026-06' } })
    expect(cabecalhosDaChamada()).toEqual({ Authorization: 'Bearer tok-123' })
    expect(fetchFalso.mock.calls[0][0]).not.toContain('tok-123')
  })

  it('combina com Content-Type em POST e não envia nada sem token', async () => {
    fetchFalso.mockResolvedValue(resposta({ id_ordem: 1 }, 201))
    const { requisitar } = await carregar()
    await requisitar('POST', '/inspecoes', { corpo: { id_uc: 'UC-1' } })
    expect(cabecalhosDaChamada()).toEqual({ 'Content-Type': 'application/json' })

    fetchFalso.mockClear()
    tokenStorage.set('tok-123')
    fetchFalso.mockResolvedValue(resposta({ id_ordem: 2 }, 201))
    await requisitar('POST', '/inspecoes', { corpo: { id_uc: 'UC-2' } })
    expect(cabecalhosDaChamada()).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-123',
    })
  })

  it('não anexa o token no login nem no cadastro', async () => {
    tokenStorage.set('tok-123')
    fetchFalso.mockResolvedValue(resposta({ access_token: 'novo' }))
    const { requisitar } = await carregar()
    await requisitar('POST', '/auth/login', { corpo: { email: 'a@b.c', senha: 'x' } })
    expect(cabecalhosDaChamada()).toEqual({ 'Content-Type': 'application/json' })
    fetchFalso.mockClear()
    fetchFalso.mockResolvedValue(resposta({}, 201))
    await requisitar('POST', '/auth/register', { corpo: {} })
    expect(cabecalhosDaChamada()).toEqual({ 'Content-Type': 'application/json' })
  })

  it('no 401: limpa o token, chama o gancho uma vez e ainda lança o erro da API', async () => {
    tokenStorage.set('tok-vencido')
    fetchFalso.mockResolvedValue(
      resposta({ codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão expirada.' }, 401),
    )
    const { requisitar, aoNaoAutorizado } = await carregar()
    const gancho = vi.fn()
    aoNaoAutorizado(gancho)
    await expect(requisitar('GET', '/dashboard')).rejects.toMatchObject({
      status: 401,
      codigo: 'NAO_AUTENTICADO',
    })
    expect(tokenStorage.get()).toBeNull()
    expect(gancho).toHaveBeenCalledTimes(1)
  })

  it('401 de credenciais inválidas no login não derruba a sessão nem chama o gancho', async () => {
    tokenStorage.set('tok-123')
    fetchFalso.mockResolvedValue(
      resposta({ codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'Credenciais inválidas.' }, 401),
    )
    const { requisitar, aoNaoAutorizado } = await carregar()
    const gancho = vi.fn()
    aoNaoAutorizado(gancho)
    await expect(requisitar('POST', '/auth/login', { corpo: {} })).rejects.toMatchObject({
      status: 401,
    })
    expect(tokenStorage.get()).toBe('tok-123')
    expect(gancho).not.toHaveBeenCalled()
  })

  it('outros erros (403, 404, 500) mantêm o token', async () => {
    tokenStorage.set('tok-123')
    const { requisitar, aoNaoAutorizado } = await carregar()
    const gancho = vi.fn()
    aoNaoAutorizado(gancho)
    for (const status of [403, 404, 500]) {
      fetchFalso.mockResolvedValueOnce(resposta({ codigo: 'X', mensagem: 'erro' }, status))
      await expect(requisitar('GET', '/dashboard')).rejects.toMatchObject({ status })
    }
    expect(tokenStorage.get()).toBe('tok-123')
    expect(gancho).not.toHaveBeenCalled()
  })

  it('o registro do gancho pode ser removido', async () => {
    fetchFalso.mockResolvedValue(resposta({ codigo: 'NAO_AUTENTICADO', mensagem: 'x' }, 401))
    const { requisitar, aoNaoAutorizado } = await carregar()
    const gancho = vi.fn()
    const remover = aoNaoAutorizado(gancho)
    remover()
    // Sem gancho, o padrão navega pelo navegador; aqui só estamos na rota /login do jsdom.
    window.history.replaceState({}, '', '/login')
    await expect(requisitar('GET', '/dashboard')).rejects.toMatchObject({ status: 401 })
    expect(gancho).not.toHaveBeenCalled()
  })
})

describe('montarUrlLogin', () => {
  it('guarda o destino codificado e evita laço dentro do próprio /login', async () => {
    const { montarUrlLogin } = await import('@/auth/naoAutorizado')
    expect(montarUrlLogin('/receita', '?municipio=Recife')).toBe(
      '/login?destino=%2Freceita%3Fmunicipio%3DRecife',
    )
    expect(montarUrlLogin('/login', '?destino=%2Fpainel')).toBe('/login')
  })
})
