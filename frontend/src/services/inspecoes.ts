import type {
  AtualizarInspecao,
  Candidatos,
  CriarInspecao,
  FalhaLote,
  Ordem,
  OrdensCriadas,
  Ordens,
  ParamsCandidatos,
  ParamsInspecoes,
  ResultadoEnvio,
} from '@/types/inspecoes'
import { ehErroApi } from './erro-api'
import { requisitar } from './http'

/** GET /inspecoes/candidatos: fila priorizada de UCs suspeitas (Tela 4). */
export function buscarCandidatos(
  params: ParamsCandidatos,
  sinal?: AbortSignal,
): Promise<Candidatos> {
  return requisitar<Candidatos>('GET', '/inspecoes/candidatos', { params, sinal })
}

/** GET /inspecoes: ordens criadas no portal, com `contagem_status` para as abas (Tela 5). */
export function listarInspecoes(
  params: ParamsInspecoes = {},
  sinal?: AbortSignal,
): Promise<Ordens> {
  return requisitar<Ordens>('GET', '/inspecoes', { params, sinal })
}

/**
 * POST /inspecoes: cria a ordem em ABERTA.
 * Erros: 404 UC_INEXISTENTE, 409 ORDEM_ATIVA_EXISTENTE, 422 DADOS_INVALIDOS.
 */
export function criarInspecao(corpo: CriarInspecao): Promise<Ordem> {
  return requisitar<Ordem>('POST', '/inspecoes', { corpo })
}

/**
 * POST /inspecoes/lote: cria todas as ordens ou nenhuma.
 * Erros: 422 LOTE_REJEITADO (UCs em `detalhes.falhas`, ver `falhasDoLote`), 422 DADOS_INVALIDOS.
 */
export function criarInspecoesEmLote(ordens: CriarInspecao[]): Promise<OrdensCriadas> {
  return requisitar<OrdensCriadas>('POST', '/inspecoes/lote', { corpo: { ordens } })
}

/** UCs recusadas num 422 LOTE_REJEITADO; lista vazia para qualquer outro erro. */
export function falhasDoLote(erro: unknown): FalhaLote[] {
  if (!ehErroApi(erro) || erro.codigo !== 'LOTE_REJEITADO') return []
  const falhas = erro.detalhes?.falhas
  return Array.isArray(falhas) ? (falhas as FalhaLote[]) : []
}

/**
 * PATCH /inspecoes/{id}: inicia campo, conclui ou cancela.
 * Erros: 400 TRANSICAO_INVALIDA, JUSTIFICATIVA_OBRIGATORIA, RESULTADO_INCOMPLETO;
 * 404 ORDEM_NAO_ENCONTRADA; 422 DADOS_INVALIDOS.
 */
export function atualizarInspecao(id: number, corpo: AtualizarInspecao): Promise<Ordem> {
  return requisitar<Ordem>('PATCH', `/inspecoes/${id}`, { corpo })
}

export function iniciarCampo(
  id: number,
  extras: { equipe_responsavel?: string; observacoes?: string } = {},
): Promise<Ordem> {
  return atualizarInspecao(id, { status: 'EM_CAMPO', ...extras })
}

export function concluirInspecao(id: number, resultado: ResultadoEnvio): Promise<Ordem> {
  return atualizarInspecao(id, { status: 'CONCLUIDA', resultado })
}

export function cancelarInspecao(id: number, justificativa: string): Promise<Ordem> {
  return atualizarInspecao(id, { status: 'CANCELADA', justificativa })
}
