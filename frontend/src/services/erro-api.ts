import type { CodigoErro } from '@/types/comum'

/** Erro padronizado da API: o corpo `{codigo, mensagem}` mais o status HTTP. */
export class ApiError extends Error {
  readonly status: number
  readonly codigo: CodigoErro
  /** Campo opcional do corpo de erro (ex.: `falhas` do 422 LOTE_REJEITADO). */
  readonly detalhes?: Record<string, unknown>

  constructor(
    status: number,
    codigo: CodigoErro,
    mensagem: string,
    detalhes?: Record<string, unknown>,
  ) {
    super(mensagem)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }

  get mensagem(): string {
    return this.message
  }
}

export function ehErroApi(erro: unknown): erro is ApiError {
  return erro instanceof ApiError
}

/** Transforma qualquer valor lançado em ApiError, para a UI tratar um único formato. */
export function normalizarErro(erro: unknown): ApiError {
  if (ehErroApi(erro)) return erro
  const mensagem = erro instanceof Error ? erro.message : 'Erro inesperado.'
  return new ApiError(0, 'ERRO_INTERNO', mensagem)
}

/** true quando a requisição foi cancelada (filtro mudou, tela fechada). */
export function foiCancelada(erro: unknown): boolean {
  return erro instanceof DOMException && erro.name === 'AbortError'
}
