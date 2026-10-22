import type { Dashboard, ParamsDashboard } from '@/types/dashboard'
import { requisitar } from './http'

/** GET /dashboard: KPIs, série de 48 meses, ponte da receita e drill-down (Telas 1 e 2). */
export function buscarDashboard(params: ParamsDashboard, sinal?: AbortSignal): Promise<Dashboard> {
  return requisitar<Dashboard>('GET', '/dashboard', { params, sinal })
}
