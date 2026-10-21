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
export type GrupoNav = { rotulo: string; itens: ItemNav[] }

/** Menu lateral: mesmos grupos e rótulos do protótipo de alta. */
export const NAVEGACAO: GrupoNav[] = [
  {
    rotulo: 'Visão estratégica',
    itens: [
      { to: '/painel', rotulo: 'Painel executivo', icone: LayoutGrid },
      { to: '/receita', rotulo: 'Diagnóstico da receita', icone: TrendingUp },
    ],
  },
  {
    rotulo: 'Clientes',
    itens: [{ to: '/unidades', rotulo: 'Visão 360 da UC', icone: User }],
  },
  {
    rotulo: 'Perdas',
    itens: [
      { to: '/perdas/fila', rotulo: 'Fila de inspeção', icone: Search },
      { to: '/perdas/ordens', rotulo: 'Ordens de inspeção', icone: ClipboardList },
    ],
  },
  {
    rotulo: 'Operação',
    itens: [{ to: '/operacao', rotulo: 'Continuidade DEC / FEC', icone: Activity }],
  },
  {
    rotulo: 'IA & dados',
    itens: [{ to: '/assistente', rotulo: 'Assistente V-Energy', icone: Sparkles }],
  },
]
