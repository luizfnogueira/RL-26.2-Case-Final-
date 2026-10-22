import type { Operacao, ParamsOperacao } from '@/types/operacao'
import { requisitar } from './http'

/** GET /operacao: DEC e FEC por alimentador, série mensal e rankings (Tela 6). */
export function buscarOperacao(params: ParamsOperacao, sinal?: AbortSignal): Promise<Operacao> {
  return requisitar<Operacao>('GET', '/operacao', { params, sinal })
}
