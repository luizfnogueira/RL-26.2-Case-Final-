import {
  Activity,
  ClipboardList,
  LayoutGrid,
  Search,
  Sparkles,
  TrendingUp,
  User,
  type LucideIcon,
} from 'lucide-react'

export type ItemNav = { to: string; rotulo: string; icone: LucideIcon }

/**
 * Navegação principal: uma lista única, só com ícone e título. Sem grupos e sem descrições —
 * o ícone e o rótulo já identificam a tela.
 */
export const NAVEGACAO: readonly ItemNav[] = [
  { to: '/painel', rotulo: 'Painel executivo', icone: LayoutGrid },
  { to: '/receita', rotulo: 'Diagnóstico da receita', icone: TrendingUp },
  { to: '/unidades', rotulo: 'Visão 360 da UC', icone: User },
  { to: '/perdas/fila', rotulo: 'Fila de inspeção', icone: Search },
  { to: '/perdas/ordens', rotulo: 'Ordens de inspeção', icone: ClipboardList },
  { to: '/operacao', rotulo: 'Continuidade DEC / FEC', icone: Activity },
  { to: '/assistente', rotulo: 'Assistente V-Energy', icone: Sparkles },
]
