import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PrototipoAuthPage from './PrototipoAuthPage'

function Endereco() {
  return <output aria-label="Endereço da prévia">{useLocation().pathname}</output>
}
function abrir(url = '/dev/auth/login') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dev/auth" element={<Navigate to="/dev/auth/login" replace />} />
        <Route path="/dev/auth/:etapa" element={<PrototipoAuthPage />} />
        <Route path="/painel" element={<p>Painel existente da equipe</p>} />
      </Routes>
      <Endereco />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('prévia isolada do fluxo de autenticação', () => {
  it('identifica a simulação e permite preencher e revelar uma senha fictícia', () => {
    abrir()
    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeTruthy()
    expect(screen.getByText('Esboço para discussão')).toBeTruthy()
    expect(screen.getByText(/Nenhuma conta ou sessão real é criada/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe('artur@venergy.test')
    expect((screen.getByLabelText('Senha') as HTMLInputElement).type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect((screen.getByLabelText('Senha') as HTMLInputElement).type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect((screen.getByLabelText('Senha') as HTMLInputElement).type).toBe('password')
  })

  it('simula login sem chamar API, emitir token ou substituir sessão existente', async () => {
    localStorage.setItem('venergy_token', 'token-anterior-ficticio')
    const gravar = vi.spyOn(Storage.prototype, 'setItem')
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(
      screen.getByRole('button', { name: 'Entrando…' }).getAttribute('disabled'),
    ).not.toBeNull()
    expect(await screen.findByRole('heading', { name: 'Você está no portal' })).toBeTruthy()
    expect(screen.getByText('Olá, Artur.')).toBeTruthy()
    expect(screen.getByText('Sessão de exemplo')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
    expect(gravar).not.toHaveBeenCalled()
    expect(localStorage.getItem('venergy_token')).toBe('token-anterior-ficticio')
  })

  it('encaminha cadastro para confirmação e login, sem autenticar automaticamente', async () => {
    abrir('/dev/auth/cadastro')
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect(await screen.findByRole('heading', { name: 'Seu acesso está pronto' })).toBeTruthy()
    expect(screen.getByText('Cadastro de exemplo concluído, Artur.')).toBeTruthy()
    expect(screen.getByLabelText('Endereço da prévia').textContent).toBe('/dev/auth/confirmacao')
    fireEvent.click(screen.getByRole('button', { name: 'Ir para login' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByRole('heading', { name: 'Você está no portal' })
    expect(fetch).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })

  it('aponta confirmação de senha divergente e mantém o cadastro aberto', () => {
    abrir('/dev/auth/cadastro')
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.change(screen.getByLabelText('Confirmar senha'), {
      target: { value: 'OutraSenha2026!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect(screen.getByRole('alert').textContent).toBe('As senhas precisam ser iguais.')
    expect(screen.getByLabelText('Confirmar senha').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Crie seu acesso' })).toBeTruthy()
  })

  it('identifica convite de demonstração inválido sem criar uma conta', () => {
    abrir('/dev/auth/cadastro')
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.change(screen.getByLabelText('Código de convite'), { target: { value: 'INCORRETO' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect(screen.getByRole('alert').textContent).toContain('Convite não reconhecido')
    expect(fetch).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })

  it('não continua com os campos obrigatórios vazios', () => {
    abrir()
    fireEvent.submit(screen.getByRole('form', { name: 'Entrar no protótipo' }))
    expect(screen.getByLabelText('Endereço da prévia').textContent).toBe('/dev/auth/login')
    expect(screen.queryByRole('button', { name: 'Entrando…' })).toBeNull()
  })

  it('mostra credenciais inválidas e permite tentar novamente com o cenário de sucesso', async () => {
    abrir()
    fireEvent.change(screen.getByRole('combobox', { name: 'Resultado simulado' }), {
      target: { value: 'invalido' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('E-mail ou senha inválidos')
    fireEvent.change(screen.getByRole('combobox', { name: 'Resultado simulado' }), {
      target: { value: 'normal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('heading', { name: 'Você está no portal' })).toBeTruthy()
  })

  it('simula indisponibilidade preservando os campos para nova tentativa', async () => {
    abrir()
    fireEvent.change(screen.getByRole('combobox', { name: 'Resultado simulado' }), {
      target: { value: 'indisponivel' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível conectar agora',
    )
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe('artur@venergy.test')
    expect(screen.getByRole('button', { name: 'Entrar' }).hasAttribute('disabled')).toBe(false)
  })

  it('simula e-mail duplicado no cadastro', async () => {
    abrir('/dev/auth/cadastro')
    fireEvent.change(screen.getByRole('combobox', { name: 'Resultado simulado' }), {
      target: { value: 'invalido' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Já existe um acesso com este e-mail',
    )
  })

  it('permite revisar expiração, voltar ao login e sair da demonstração', async () => {
    abrir('/dev/auth/sessao')
    fireEvent.click(screen.getByRole('button', { name: 'Simular sessão expirada' }))
    expect(screen.getByRole('heading', { name: 'Sua sessão expirou' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar novamente' }))
    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Sessão' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sair da demonstração' }))
    expect(screen.getByLabelText('Endereço da prévia').textContent).toBe('/dev/auth/login')
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('')
  })

  it('cancela o envio visual se a pessoa mudar de tela', async () => {
    vi.useFakeTimers()
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    fireEvent.click(screen.getByRole('link', { name: 'Cadastro' }))
    await act(async () => {
      vi.runAllTimers()
    })
    expect(screen.getByRole('heading', { name: 'Crie seu acesso' })).toBeTruthy()
    expect(screen.getByLabelText('Endereço da prévia').textContent).toBe('/dev/auth/cadastro')
  })

  it('mostra a prévia do painel pelo link existente, sem aplicar proteção global', () => {
    abrir('/dev/auth/sessao')
    fireEvent.click(screen.getByRole('link', { name: 'Visualizar Painel Executivo' }))
    expect(screen.getByText('Painel existente da equipe')).toBeTruthy()
  })

  it('retorna ao login em uma etapa inexistente, sem redirecionar para fora do portal', () => {
    abrir('/dev/auth/inexistente')
    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeTruthy()
    expect(screen.getByLabelText('Endereço da prévia').textContent).toBe('/dev/auth/login')
  })
})
