import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStorage } from '@/auth/tokenStorage'
import PrototipoAuthPage from './PrototipoAuthPage'

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  AUTH_PREVIEW_API: true,
}))
vi.mock('@/services/env', () => ({ API_URL: 'http://localhost:8000', USE_MOCKS: false }))

const usuario = {
  id: 'usuario-teste',
  nome: 'Artur Teste',
  email: 'artur@example.com',
  perfil: 'usuario',
}
const sessao = { access_token: 'token-sintetico', token_type: 'bearer', usuario }
const buscar = vi.fn<typeof fetch>()
const resposta = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function Endereco() {
  return <output aria-label="URL">{useLocation().pathname}</output>
}

function abrir(url = '/dev/auth/login') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dev/auth" element={<Navigate to="/dev/auth/login" replace />} />
        <Route path="/dev/auth/:etapa" element={<PrototipoAuthPage />} />
      </Routes>
      <Endereco />
    </MemoryRouter>,
  )
}

function preencherLogin() {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: usuario.email } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Senha de teste!' } })
}

function preencherCadastro() {
  preencherLogin()
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: usuario.nome } })
  fireEvent.change(screen.getByLabelText('Confirmar senha'), {
    target: { value: 'Senha de teste!' },
  })
}

beforeEach(() => {
  buscar.mockReset()
  tokenStorage.clear()
  vi.stubGlobal('fetch', buscar)
})
afterEach(() => {
  cleanup()
  tokenStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Prévia de AUTH conectada ao cliente HTTP', () => {
  it('cadastra na API, exige login, consulta a sessão e permite sair', async () => {
    buscar
      .mockResolvedValueOnce(resposta(usuario, 201))
      .mockResolvedValueOnce(resposta(sessao))
      .mockResolvedValueOnce(resposta(usuario))
    abrir('/dev/auth/cadastro?cenario=invalido')
    expect(screen.queryByRole('button', { name: 'Preencher exemplo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revisar fluxo' })).toBeNull()
    expect(screen.queryByLabelText('Código de convite')).toBeNull()
    preencherCadastro()
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    await screen.findByRole('heading', { name: 'Seu acesso está pronto' })
    expect(buscar.mock.calls[0][0]).toBe('http://localhost:8000/auth/register')
    expect(JSON.parse(buscar.mock.calls[0][1]!.body as string)).toEqual({
      nome: usuario.nome,
      email: usuario.email,
      senha: 'Senha de teste!',
    })
    expect(tokenStorage.get()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ir para login' }))
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe(usuario.email)
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('')
    preencherLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByText('Sessão autenticada')
    expect(buscar.mock.calls[1][0]).toBe('http://localhost:8000/auth/login')
    expect(buscar.mock.calls[2][0]).toBe('http://localhost:8000/auth/me')
    expect(buscar.mock.calls[2][1]!.headers).toEqual({ Authorization: 'Bearer token-sintetico' })
    expect(tokenStorage.get()).toBe(sessao.access_token)
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    await screen.findByRole('button', { name: 'Entrar' })
    expect(tokenStorage.get()).toBeNull()
  })

  it.each([
    [503, 'AUTH_INDISPONIVEL', 'O acesso está indisponível no momento.'],
    [409, 'EMAIL_JA_CADASTRADO', 'Já existe um acesso com este e-mail.'],
  ])('exibe o erro de cadastro HTTP %s sem simular sucesso', async (status, codigo, mensagem) => {
    buscar.mockResolvedValue(resposta({ codigo, mensagem }, status))
    abrir('/dev/auth/cadastro')
    preencherCadastro()
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect((await screen.findByRole('alert')).textContent).toContain(mensagem)
    expect(screen.getByLabelText('URL').textContent).toBe('/dev/auth/cadastro')
    expect(tokenStorage.get()).toBeNull()
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe(usuario.email)
  })

  it('permite corrigir senha inválida e só abre sessão após resposta válida', async () => {
    buscar
      .mockResolvedValueOnce(
        resposta({ codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'E-mail ou senha inválidos.' }, 401),
      )
      .mockResolvedValueOnce(resposta(sessao))
      .mockResolvedValueOnce(resposta(usuario))
    abrir()
    preencherLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('E-mail ou senha inválidos.')
    expect(tokenStorage.get()).toBeNull()
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Outra senha de teste!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByText('Sessão autenticada')
    expect(screen.getByText('Olá, Artur Teste.')).toBeTruthy()
  })

  it('restaura usuário pelo token após recarregar a prévia', async () => {
    tokenStorage.set(sessao.access_token)
    buscar.mockResolvedValue(resposta(usuario))
    abrir('/dev/auth/sessao')
    await screen.findByText('Olá, Artur Teste.')
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Sessão de exemplo')).toBeNull()
  })

  it('redireciona sessão sem token para login', async () => {
    abrir('/dev/auth/sessao')
    await screen.findByRole('button', { name: 'Entrar' })
    expect(buscar).not.toHaveBeenCalled()
    expect(screen.queryByText('Sessão autenticada')).toBeNull()
  })

  it('limpa token rejeitado pela API e apresenta sessão expirada', async () => {
    tokenStorage.set('expirado')
    buscar.mockResolvedValue(
      resposta({ codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão inválida ou expirada.' }, 401),
    )
    abrir('/dev/auth/sessao')
    await screen.findByRole('heading', { name: 'Sua sessão expirou' })
    expect(tokenStorage.get()).toBeNull()
  })

  it('trata indisponibilidade da sessão com nova tentativa', async () => {
    tokenStorage.set(sessao.access_token)
    buscar
      .mockResolvedValueOnce(
        resposta({ codigo: 'ERRO_INTERNO', mensagem: 'Serviço indisponível.' }, 503),
      )
      .mockResolvedValueOnce(resposta(usuario))
    abrir('/dev/auth/sessao')
    await screen.findByRole('alert')
    expect(screen.queryByText('Sessão autenticada')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await screen.findByText('Sessão autenticada')
  })

  it('impede envio duplicado e cancela login ao sair da tela sem gravar token tardio', async () => {
    let resolver!: (r: Response) => void
    buscar.mockImplementation(
      () =>
        new Promise((r) => {
          resolver = r
        }),
    )
    const tela = abrir()
    preencherLogin()
    const form = screen.getByRole('form', { name: 'Entrar no protótipo' })
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1))
    const sinal = buscar.mock.calls[0][1]!.signal!
    tela.unmount()
    expect(sinal.aborted).toBe(true)
    resolver(resposta(sessao))
    await new Promise((r) => setTimeout(r, 0))
    expect(tokenStorage.get()).toBeNull()
  })

  it('não declara sessão ativa quando o navegador bloqueia o armazenamento', async () => {
    vi.spyOn(tokenStorage, 'set').mockImplementation(() => {})
    buscar.mockResolvedValue(resposta(sessao))
    abrir()
    preencherLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Permita o armazenamento')
    expect(screen.queryByText('Sessão autenticada')).toBeNull()
  })
})
