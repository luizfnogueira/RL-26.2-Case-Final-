import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tokenStorage } from '@/auth/tokenStorage'
import PrototipoAuthPage from './PrototipoAuthPage'

// Opt-in: VITE_TEST_AUTH_URL. Cria uma conta sintética
// no ambiente indicado e percorre formulário → HTTP → PostgreSQL, sem mock de resposta.
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  AUTH_PREVIEW_API: true,
}))
vi.mock('@/services/env', () => ({ API_URL: import.meta.env.VITE_TEST_AUTH_URL, USE_MOCKS: false }))

afterEach(() => {
  cleanup()
  tokenStorage.clear()
})

function abrir(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dev/auth/:etapa" element={<PrototipoAuthPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe.skipIf(!import.meta.env.VITE_TEST_AUTH_URL)('AUTH com API e PostgreSQL reais', () => {
  it('cadastra, rejeita senha incorreta, autentica, restaura a sessão e sai', async () => {
    tokenStorage.clear()
    const email = `qa-auth-${crypto.randomUUID()}@example.com`
    const senha = `Teste-${crypto.randomUUID()}`
    const tela = abrir('/dev/auth/cadastro')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Conta QA Auth' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: senha } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    await screen.findByRole('heading', { name: 'Seu acesso está pronto' }, { timeout: 10000 })
    expect(tokenStorage.get()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ir para login' }))
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'incorreta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert', {}, { timeout: 10000 })).textContent).toContain(
      'E-mail ou senha inválidos.',
    )
    expect(tokenStorage.get()).toBeNull()
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByText('Sessão autenticada', {}, { timeout: 10000 })
    expect(screen.getByText('Olá, Conta QA Auth.')).toBeTruthy()
    expect(tokenStorage.get()).toBeTruthy()
    tela.unmount()
    abrir('/dev/auth/sessao')
    await screen.findByText('Sessão autenticada', {}, { timeout: 10000 })
    expect(screen.getByText(email)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    await screen.findByRole('button', { name: 'Entrar' })
    expect(tokenStorage.get()).toBeNull()
  }, 30000)
})
