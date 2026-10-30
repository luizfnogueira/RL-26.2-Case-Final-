import { tratarNaoAutorizado } from '@/auth/naoAutorizado'
import { tokenStorage } from '@/auth/tokenStorage'
import { API_URL, USE_MOCKS } from './env'
import { ApiError } from './erro-api'

/**
 * Rotas que não levam token: o 401 delas é "credenciais inválidas", não "sessão expirada",
 * então também não dispara o gancho de logout.
 */
const ROTAS_SEM_SESSAO = ['/auth/login', '/auth/register']

function ehRotaSemSessao(caminho: string): boolean {
  return ROTAS_SEM_SESSAO.some((rota) => caminho === rota || caminho.startsWith(`${rota}?`))
}

export type Metodo = 'GET' | 'POST' | 'PATCH'

export interface OpcoesRequisicao {
  /** Vira query string. Valores undefined, null e '' são omitidos. */
  params?: object
  /** Corpo JSON (POST e PATCH). */
  corpo?: unknown
  /** Cancela a requisição quando os filtros mudam ou a tela é fechada. */
  sinal?: AbortSignal
}

type ValorQuery =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean)[]

export function construirQuery(params?: object): string {
  const busca = new URLSearchParams()
  for (const [chave, valor] of Object.entries((params ?? {}) as Record<string, ValorQuery>)) {
    if (valor === undefined || valor === null || valor === '') continue
    if (Array.isArray(valor)) {
      for (const item of valor) {
        if (item !== undefined && item !== null && item !== '') {
          busca.append(chave, String(item))
        }
      }
    } else {
      busca.set(chave, String(valor))
    }
  }
  const texto = busca.toString()
  return texto ? `?${texto}` : ''
}

function ehCorpoDeErro(valor: unknown): valor is { codigo: string; mensagem: string } {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as Record<string, unknown>).codigo === 'string' &&
    typeof (valor as Record<string, unknown>).mensagem === 'string'
  )
}

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json()
  } catch {
    return undefined
  }
}

/**
 * Única porta de saída para a API. Com `VITE_USE_MOCKS=true` as chamadas vão para os mocks
 * (dados fictícios, sem backend); caso contrário, para `VITE_API_URL`. Em ambos os casos o
 * erro sai como ApiError com o formato `{codigo, mensagem}` do contrato.
 */
export async function requisitar<T>(
  metodo: Metodo,
  caminho: string,
  opcoes: OpcoesRequisicao = {},
): Promise<T> {
  if (USE_MOCKS) {
    const { atenderMock } = await import('./mock')
    return (await atenderMock(metodo, caminho, opcoes)) as T
  }

  const temCorpo = opcoes.corpo !== undefined
  const semSessao = ehRotaSemSessao(caminho)
  // Único ponto que anexa o token: sempre e só para a API (a URL base vem de VITE_API_URL).
  const token = semSessao ? null : tokenStorage.get()
  const cabecalhos: Record<string, string> = {}
  if (temCorpo) cabecalhos['Content-Type'] = 'application/json'
  if (token) cabecalhos.Authorization = `Bearer ${token}`

  let resposta: Response
  try {
    resposta = await fetch(`${API_URL}${caminho}${construirQuery(opcoes.params)}`, {
      method: metodo,
      headers: Object.keys(cabecalhos).length > 0 ? cabecalhos : undefined,
      body: temCorpo ? JSON.stringify(opcoes.corpo) : undefined,
      signal: opcoes.sinal,
    })
  } catch (erro) {
    if (opcoes.sinal?.aborted) throw erro
    throw new ApiError(
      0,
      'REDE_INDISPONIVEL',
      'Não foi possível conectar à API. Verifique se o servidor está no ar.',
    )
  }

  const corpo = await lerJson(resposta)
  if (!resposta.ok) {
    // Gancho único do 401: sessão inválida. O erro continua sendo lançado para a tela que pediu.
    if (resposta.status === 401 && !semSessao) tratarNaoAutorizado()
    if (ehCorpoDeErro(corpo)) throw new ApiError(resposta.status, corpo.codigo, corpo.mensagem)
    throw new ApiError(
      resposta.status,
      resposta.status >= 500 ? 'ERRO_INTERNO' : 'RESPOSTA_INVALIDA',
      `A API respondeu com erro ${resposta.status}.`,
    )
  }
  if (corpo === undefined) {
    throw new ApiError(resposta.status, 'RESPOSTA_INVALIDA', 'A API devolveu uma resposta vazia.')
  }
  return corpo as T
}
