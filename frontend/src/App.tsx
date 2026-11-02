import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import AuthProvider from '@/auth/AuthProvider'
import TemaProvider from '@/theme/TemaProvider'
import ExigirAutenticacao from '@/auth/ExigirAutenticacao'
import AuthPage from '@/pages/auth/AuthPage'
import RedirecionarAuthLegado from '@/auth/RedirecionarAuthLegado'
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
  { path: 'login', element: <AuthPage etapa="login" /> },
  { path: 'cadastro', element: <AuthPage etapa="cadastro" /> },
  { path: 'dev/auth', element: <RedirecionarAuthLegado /> },
  { path: 'dev/auth/:etapa', element: <RedirecionarAuthLegado /> },
  {
    element: (
      <ExigirAutenticacao>
        <AppLayout />
      </ExigirAutenticacao>
    ),
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
  return (
    <TemaProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </TemaProvider>
  )
}
