import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '@/auth/AuthProvider'
import ExigirAutenticacao from '@/auth/ExigirAutenticacao'
import { tokenStorage } from '@/auth/tokenStorage'
import { useRetornoAoLogin } from '@/auth/useRetornoAoLogin'
import AcoesCabecalho from '@/layouts/AcoesCabecalho'
import BarraSuperiorMobile from '@/layouts/BarraSuperiorMobile'
import AuthPage from './AuthPage'

// Opt-in com banco descartável: VITE_TEST_AUTH_URL e VITE_TEST_AUTH_INVITE.
vi.mock('@/services/env', () => ({ API_URL: import.meta.env.VITE_TEST_AUTH_URL, USE_MOCKS: false }))
afterEach(() => {
  cleanup()
  tokenStorage.clear()
  vi.unstubAllEnvs()
})
function Portal() {
  useRetornoAoLogin()
  return (
    <>
      <h1>Painel executivo</h1>
      <AcoesCabecalho />
      <BarraSuperiorMobile onAbrirMenu={() => {}} />
    </>
  )
}
function abrirMenu() {
  fireEvent.click(screen.getAllByRole('button', { name: /Opções da conta de/ })[0])
}
function sair() {
  if (!screen.queryByRole('button', { name: 'Sair da conta' })) abrirMenu()
  fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
}
function abrir(url: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/login" element={<AuthPage etapa="login" />} />
          <Route path="/cadastro" element={<AuthPage etapa="cadastro" />} />
          <Route
            path="/painel"
            element={
              <ExigirAutenticacao>
                <Portal />
              </ExigirAutenticacao>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}
describe.skipIf(!import.meta.env.VITE_TEST_AUTH_URL)('AUTH com API e PostgreSQL reais', () => {
  it('cadastra com convite, entra diretamente no painel com a conta correta, restaura e faz logout', async () => {
    tokenStorage.clear()

    const email = `qa-auth-${crypto.randomUUID()}@example.com`
    const senha = `Teste-${crypto.randomUUID()}`
    const tela = abrir('/cadastro')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Conta QA Auth' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: senha } })
    fireEvent.change(screen.getByLabelText('Código de convite'), {
      target: { value: import.meta.env.VITE_TEST_AUTH_INVITE },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    await screen.findByText('Conta criada. Entre com seu e-mail e senha.', {}, { timeout: 10000 })
    expect(tokenStorage.get()).toBeNull()
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'incorreta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert', {}, { timeout: 10000 })).textContent).toContain(
      'E-mail ou senha inválidos.',
    )
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByRole('heading', { name: 'Painel executivo' }, { timeout: 10000 })
    await screen.findByText('Conta QA Auth', {}, { timeout: 10000 })
    expect(screen.getAllByLabelText('Conta: Conta QA Auth')).toHaveLength(2)
    expect(screen.getByText('Usuário')).toBeTruthy()
    abrirMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }))
    fireEvent.change(screen.getByLabelText('Cargo ou área'), {
      target: { value: 'Analista de Operação' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 10000 })
    expect(screen.getByText('Analista de Operação')).toBeTruthy()
    expect(screen.queryByText('Patrícia Lins')).toBeNull()
    expect(tokenStorage.get()).toBeTruthy()
    tela.unmount()
    abrir('/painel')
    await screen.findByText('Conta QA Auth', {}, { timeout: 10000 })
    expect(screen.getByText('Analista de Operação')).toBeTruthy()
    sair()
    await screen.findByRole('button', { name: 'Entrar' })
    expect(tokenStorage.get()).toBeNull()
    expect(screen.queryByText('Conta QA Auth')).toBeNull()
  }, 30000)
})
