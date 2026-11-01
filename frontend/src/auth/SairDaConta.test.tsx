import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tokenStorage } from '@/auth/tokenStorage'
import SairDaConta from '@/auth/SairDaConta'

function Endereco() {
  return <output aria-label="Endereço">{useLocation().pathname}</output>
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/painel']}>
      <Routes>
        <Route path="/painel" element={<SairDaConta />} />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
      <Endereco />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  tokenStorage.clear()
})

afterEach(() => {
  cleanup()
  tokenStorage.clear()
  vi.unstubAllEnvs()
})

it('limpa a sessão do portal e volta ao login ao sair', () => {
  tokenStorage.set('token-de-teste')
  abrir()
  fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
  expect(tokenStorage.get()).toBeNull()
  expect(screen.getByLabelText('Endereço').textContent).toBe('/login')
  expect(screen.queryByRole('button', { name: 'Sair da conta' })).toBeNull()
})

it('não mostra saída sem sessão', () => {
  abrir()
  expect(screen.queryByRole('button', { name: 'Sair da conta' })).toBeNull()
})

it('mantém logout disponível em produção sem depender da antiga flag de prévia', () => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_AUTH_PREVIEW_API', 'false')
  tokenStorage.set('token-de-teste')
  abrir()
  expect(screen.getByRole('button', { name: 'Sair da conta' })).toBeTruthy()
  expect(tokenStorage.get()).toBe('token-de-teste')
})
