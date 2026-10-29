import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import AppLayout from '@/layouts/AppLayout'
import AssistentePage from '@/pages/AssistentePage'
import FilaPage from '@/pages/FilaPage'
import NotFoundPage from '@/pages/NotFoundPage'
import OperacaoPage from '@/pages/OperacaoPage'
import OrdensPage from '@/pages/OrdensPage'
import PainelPage from '@/pages/PainelPage'
import ReceitaPage from '@/pages/ReceitaPage'
import UnidadePage from '@/pages/UnidadePage'

const router = createBrowserRouter([
  ...(import.meta.env.DEV
    ? [
        { path: 'dev/auth', element: <Navigate to="/dev/auth/login" replace /> },
        {
          path: 'dev/auth/:etapa',
          lazy: async () => ({
            Component: (await import('@/pages/dev/auth/PrototipoAuthPage')).default,
          }),
        },
      ]
    : []),
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/painel" replace /> },
      { path: 'painel', element: <PainelPage /> },
      { path: 'receita', element: <ReceitaPage /> },
      { path: 'unidades', element: <UnidadePage /> },
      { path: 'unidades/:id', element: <UnidadePage /> },
      { path: 'perdas', element: <Navigate to="/perdas/fila" replace /> },
      { path: 'perdas/fila', element: <FilaPage /> },
      { path: 'perdas/ordens', element: <OrdensPage /> },
      { path: 'operacao', element: <OperacaoPage /> },
      { path: 'assistente', element: <AssistentePage /> },
      // Galeria dos componentes comuns: só em desenvolvimento, fora do build de produção.
      ...(import.meta.env.DEV
        ? [
            {
              path: 'dev/componentes',
              lazy: async () => ({
                Component: (await import('@/pages/dev/ComponentesPage')).default,
              }),
            },
          ]
        : []),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
