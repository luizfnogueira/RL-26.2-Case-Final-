import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthProvider from '@/auth/AuthProvider'
import ExigirAutenticacao from '@/auth/ExigirAutenticacao'
import RedirecionarAuthLegado from '@/auth/RedirecionarAuthLegado'
import { tokenStorage } from '@/auth/tokenStorage'
import { useRetornoAoLogin } from '@/auth/useRetornoAoLogin'
import AcoesCabecalho from '@/layouts/AcoesCabecalho'
import BarraSuperiorMobile from '@/layouts/BarraSuperiorMobile'
import TemaProvider from '@/theme/TemaProvider'
import AuthPage from './AuthPage'

vi.mock('@/services/env', () => ({ API_URL: 'http://localhost:8000', USE_MOCKS: false }))
const usuario = {
  id: 'usuario-teste',
  nome: 'Artur Teste',
  cargo: null,
  email: 'artur@example.com',
  perfil: 'usuario',
}
const sessao = { access_token: 'token-sintetico', token_type: 'bearer', usuario }
const buscar = vi.fn<typeof fetch>()
const resposta = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } })
function Portal() {
  useRetornoAoLogin()
  return (
    <>
      <h1>Painel</h1>
      <AcoesCabecalho />
      <BarraSuperiorMobile onAbrirMenu={() => {}} />
    </>
  )
}
function Endereco() {
  const { pathname, search, hash } = useLocation()
  return (
    <output aria-label="URL">
      {pathname}
      {search}
      {hash}
    </output>
  )
}
function abrirMenu() {
  fireEvent.click(screen.getAllByRole('button', { name: /Opções da conta de/ })[0])
}
function sair() {
  if (!screen.queryByRole('button', { name: 'Sair da conta' })) abrirMenu()
  fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
}
function abrir(url = '/login', protegido = false) {
  return render(
    <TemaProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/login" element={<AuthPage etapa="login" />} />
            <Route path="/cadastro" element={<AuthPage etapa="cadastro" />} />
            <Route path="/dev/auth/:etapa" element={<RedirecionarAuthLegado />} />
            <Route
              path="/painel"
              element={
                protegido ? (
                  <ExigirAutenticacao>
                    <Portal />
                  </ExigirAutenticacao>
                ) : (
                  <Portal />
                )
              }
            />
            <Route
              path="/receita"
              element={
                protegido ? (
                  <ExigirAutenticacao>
                    <Portal />
                  </ExigirAutenticacao>
                ) : (
                  <Portal />
                )
              }
            />
          </Routes>
          <Endereco />
        </MemoryRouter>
      </AuthProvider>
    </TemaProvider>,
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
  fireEvent.change(screen.getByLabelText('Código de convite'), {
    target: { value: 'CONVITE-SINTETICO-TESTE' },
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
  vi.unstubAllEnvs()
})

describe('autenticação integrada ao portal', () => {
  it('protege as telas sem sessão e preserva o recorte para depois do login', () => {
    abrir('/receita?municipio=RECIFE#ponte', true)
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()
    const url = new URL(screen.getByLabelText('URL').textContent!, 'http://portal.test')
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('destino')).toBe('/receita?municipio=RECIFE#ponte')
    expect(screen.queryByRole('heading', { name: 'Painel' })).toBeNull()
    expect(buscar).not.toHaveBeenCalled()
  })

  it('aguarda a validação do token antes de montar a tela protegida', async () => {
    let resolver!: (r: Response) => void
    tokenStorage.set(sessao.access_token)
    buscar.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolver = r
        }),
    )
    abrir('/painel', true)
    expect(screen.getByText('Conferindo seu acesso…')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Painel' })).toBeNull()
    await act(async () => resolver(resposta(usuario)))
    expect(screen.getByRole('heading', { name: 'Painel' })).toBeTruthy()
  })

  it('não abre a tela protegida se a verificação da sessão falhar', async () => {
    tokenStorage.set(sessao.access_token)
    buscar
      .mockResolvedValueOnce(
        resposta({ codigo: 'ERRO_INTERNO', mensagem: 'Serviço indisponível.' }, 503),
      )
      .mockResolvedValueOnce(resposta(usuario))
    abrir('/painel', true)
    await screen.findByRole('alert')
    expect(screen.queryByRole('heading', { name: 'Painel' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await screen.findByText('Artur Teste')
  })

  it.each(['login', 'cadastro', 'sessao', 'expirada', 'confirmacao'])(
    'mantém links antigos %s como redirecionamentos sem telas de demonstração',
    (etapa) => {
      abrir(`/dev/auth/${etapa}`)
      expect(screen.getByLabelText('URL').textContent).toBe(
        etapa === 'cadastro' ? '/cadastro' : '/login',
      )
      expect(screen.queryByText('Fluxo em revisão')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Preencher exemplo' })).toBeNull()
    },
  )

  it('salva cargo pelo menu da conta e atualiza o cabeçalho sem mudar o perfil de acesso', async () => {
    tokenStorage.set(sessao.access_token)
    buscar
      .mockResolvedValueOnce(resposta(usuario))
      .mockResolvedValueOnce(resposta({ ...usuario, cargo: 'Analista de Operação' }))
    abrir('/painel')
    await screen.findByText('Artur Teste')
    abrirMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }))
    expect(screen.getByRole('dialog', { name: 'Editar perfil' })).toBeTruthy()
    const campo = screen.getByLabelText('Cargo ou área')
    expect(document.activeElement).toBe(campo)
    fireEvent.change(campo, { target: { value: '  Analista de Operação  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Analista de Operação')).toBeTruthy()
    expect(buscar.mock.calls[1][1]!.method).toBe('PATCH')
    expect(JSON.parse(buscar.mock.calls[1][1]!.body as string)).toEqual({
      cargo: 'Analista de Operação',
    })
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('permite editar pelo avatar no celular e apagar o cargo personalizado', async () => {
    tokenStorage.set(sessao.access_token)
    buscar
      .mockResolvedValueOnce(resposta({ ...usuario, cargo: 'Financeiro' }))
      .mockResolvedValueOnce(resposta(usuario))
    abrir('/painel')
    await screen.findByText('Financeiro')
    fireEvent.click(screen.getAllByRole('button', { name: /Opções da conta de/ })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }))
    fireEvent.change(screen.getByLabelText('Cargo ou área'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Usuário')).toBeTruthy()
    expect(JSON.parse(buscar.mock.calls[1][1]!.body as string)).toEqual({ cargo: null })
  })

  it('mantém o cargo anterior e o formulário aberto quando salvar falha', async () => {
    tokenStorage.set(sessao.access_token)
    buscar
      .mockResolvedValueOnce(resposta(usuario))
      .mockResolvedValueOnce(
        resposta({ codigo: 'ERRO_INTERNO', mensagem: 'Não foi possível salvar.' }, 503),
      )
    abrir('/painel')
    await screen.findByText('Artur Teste')
    abrirMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }))
    fireEvent.change(screen.getByLabelText('Cargo ou área'), { target: { value: 'Operação' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível salvar.')
    expect(screen.getByText('Usuário')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('limita o cargo a 80 caracteres e permite cancelar sem salvar', async () => {
    tokenStorage.set(sessao.access_token)
    buscar.mockResolvedValueOnce(resposta(usuario))
    abrir('/painel')
    await screen.findByText('Artur Teste')
    abrirMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }))
    expect(screen.getByLabelText('Cargo ou área').getAttribute('maxlength')).toBe('80')
    fireEvent.change(screen.getByLabelText('Cargo ou área'), { target: { value: 'x'.repeat(81) } })
    fireEvent.submit(screen.getByRole('form', { name: 'Editar perfil' }))
    expect(screen.getByRole('alert').textContent).toContain('Use até 80 caracteres')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cadastra com convite, volta ao login, entra direto no painel e apresenta a conta real', async () => {
    buscar
      .mockResolvedValueOnce(resposta(usuario, 201))
      .mockResolvedValueOnce(resposta(sessao))
      .mockResolvedValueOnce(resposta(usuario))
    abrir('/cadastro')
    preencherCadastro()
    const nav = within(screen.getByRole('navigation', { name: 'Acesso à conta' }))
    expect(nav.getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Preencher exemplo' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    await screen.findByText('Conta criada. Entre com seu e-mail e senha.')
    expect(screen.getByLabelText('URL').textContent).toBe('/login')
    expect(JSON.parse(buscar.mock.calls[0][1]!.body as string)).toEqual({
      nome: usuario.nome,
      email: usuario.email,
      senha: 'Senha de teste!',
      convite: 'CONVITE-SINTETICO-TESTE',
    })
    expect(tokenStorage.get()).toBeNull()
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('')
    preencherLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByText('Artur Teste')
    expect(screen.getByLabelText('URL').textContent).toBe('/painel')
    expect(screen.getByText('Usuário')).toBeTruthy()
    expect(screen.getAllByText('AT')).toHaveLength(2)
    expect(screen.queryByText('Patrícia Lins')).toBeNull()
    expect(screen.queryByText('Diretoria de TI')).toBeNull()
    expect(buscar.mock.calls[2][0]).toBe('http://localhost:8000/auth/me')
    expect(buscar.mock.calls[2][1]!.headers).toEqual({ Authorization: 'Bearer token-sintetico' })
    expect(buscar).toHaveBeenCalledTimes(3)
    sair()
    await screen.findByRole('button', { name: 'Entrar' })
    expect(tokenStorage.get()).toBeNull()
    expect(screen.queryByText('Artur Teste')).toBeNull()
  })

  it('restaura o nome e o perfil no desktop e no celular após recarregar', async () => {
    tokenStorage.set(sessao.access_token)
    buscar.mockImplementation(async () => resposta({ ...usuario, perfil: 'administrador' }))
    const tela = abrir('/painel')
    expect(screen.queryByText('Patrícia Lins')).toBeNull()
    await screen.findByText('Artur Teste')
    expect(screen.getByText('Administrador')).toBeTruthy()
    expect(screen.getAllByLabelText('Conta: Artur Teste')).toHaveLength(2)
    tela.unmount()
    abrir('/painel')
    await screen.findByText('Artur Teste')
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('volta ao login com aviso quando a API rejeita o token e preserva o destino', async () => {
    tokenStorage.set('expirado')
    buscar.mockResolvedValue(
      resposta({ codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão inválida ou expirada.' }, 401),
    )
    abrir('/receita?municipio=RECIFE#ponte')
    await screen.findByText('Sua sessão expirou. Entre novamente para continuar.')
    expect(tokenStorage.get()).toBeNull()
    expect(screen.getByLabelText('URL').textContent).toContain('/login?destino=')
    expect(screen.queryByRole('heading', { name: 'Sua sessão expirou' })).toBeNull()
  })

  it('mantém o destino seguro depois do login e do logout', async () => {
    buscar.mockResolvedValueOnce(resposta(sessao)).mockResolvedValueOnce(resposta(usuario))
    const destino = '/receita?municipio=RECIFE#ponte'
    abrir('/login?' + new URLSearchParams({ destino }))
    preencherLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByText('Artur Teste')
    expect(screen.getByLabelText('URL').textContent).toBe(destino)
    sair()
    const url = new URL(screen.getByLabelText('URL').textContent!, 'http://portal.test')
    expect(url.searchParams.get('destino')).toBe(destino)
  })

  it.each(['login', 'cadastro'])(
    'explica e-mail .test inválido no %s antes de consultar a API',
    (etapa) => {
      abrir(`/${etapa}`)
      if (etapa === 'cadastro') preencherCadastro()
      else preencherLogin()
      const email = screen.getByLabelText('E-mail')
      fireEvent.change(email, { target: { value: 'artur@venergy.test' } })
      fireEvent.click(
        screen.getByRole('button', { name: etapa === 'cadastro' ? 'Criar acesso' : 'Entrar' }),
      )
      expect(screen.getByText(/O domínio .test é reservado/)).toBeTruthy()
      expect(document.activeElement).toBe(email)
      expect(buscar).not.toHaveBeenCalled()
    },
  )

  it('não envia cadastro sem convite', () => {
    abrir('/cadastro')
    preencherCadastro()
    fireEvent.change(screen.getByLabelText('Código de convite'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect(screen.getByText('Informe o código de convite recebido.')).toBeTruthy()
    expect(buscar).not.toHaveBeenCalled()
  })

  it.each([
    [403, 'CONVITE_INVALIDO', 'Código de convite inválido.'],
    [409, 'EMAIL_JA_CADASTRADO', 'Já existe um acesso com este e-mail.'],
    [503, 'AUTH_INDISPONIVEL', 'O acesso está indisponível.'],
  ])('exibe o erro de cadastro %s sem simular sucesso', async (status, codigo, mensagem) => {
    buscar.mockResolvedValue(resposta({ codigo, mensagem }, Number(status)))
    abrir('/cadastro')
    preencherCadastro()
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect((await screen.findByRole('alert')).textContent).toContain(String(mensagem))
    expect(screen.getByLabelText('URL').textContent).toBe('/cadastro')
    expect(tokenStorage.get()).toBeNull()
  })

  it('permite corrigir senha inválida antes de abrir o painel', async () => {
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
    await screen.findByText('Artur Teste')
  })

  it('não mostra a identidade anterior enquanto carrega outra conta nem aceita resposta atrasada', async () => {
    let resolver!: (r: Response) => void
    tokenStorage.set('primeiro')
    buscar
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolver = r
          }),
      )
      .mockResolvedValueOnce(resposta({ ...usuario, nome: 'Outra Pessoa' }))
    abrir('/painel')
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1))
    act(() => tokenStorage.set('segundo'))
    await screen.findByText('Outra Pessoa')
    await act(async () => resolver(resposta(usuario)))
    expect(screen.queryByText('Artur Teste')).toBeNull()
    expect(screen.getByText('Outra Pessoa')).toBeTruthy()
  })

  it('remove a identidade carregada assim que a conta muda em outra aba', async () => {
    let resolver!: (r: Response) => void
    tokenStorage.set('primeiro')
    buscar.mockResolvedValueOnce(resposta(usuario)).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolver = r
        }),
    )
    abrir('/painel')
    await screen.findByText('Artur Teste')
    act(() => {
      localStorage.setItem('venergy_token', 'outra-conta')
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'venergy_token', newValue: 'outra-conta' }),
      )
    })
    expect(screen.queryByText('Artur Teste')).toBeNull()
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(2))
    await act(async () => resolver(resposta({ ...usuario, nome: 'Outra Pessoa' })))
    expect(screen.getByText('Outra Pessoa')).toBeTruthy()
  })

  it('permite logout durante a consulta de identidade e ignora sua resposta tardia', async () => {
    let resolver!: (r: Response) => void
    tokenStorage.set(sessao.access_token)
    buscar.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolver = r
        }),
    )
    abrir('/painel')
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1))
    sair()
    expect(tokenStorage.get()).toBeNull()
    await act(async () => resolver(resposta(usuario)))
    expect(screen.queryByText('Artur Teste')).toBeNull()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()
  })

  it('trata falha na consulta da conta sem usar o nome fictício e permite tentar novamente', async () => {
    tokenStorage.set(sessao.access_token)
    buscar
      .mockResolvedValueOnce(
        resposta({ codigo: 'ERRO_INTERNO', mensagem: 'Serviço indisponível.' }, 503),
      )
      .mockResolvedValueOnce(resposta(usuario))
    abrir('/painel')
    await screen.findByText('Conta indisponível')
    expect(screen.queryByText('Patrícia Lins')).toBeNull()
    abrirMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar carregar conta' }))
    abrirMenu()
    await screen.findByText('Artur Teste')
  })

  it('não inventa uma conta ao abrir o portal sem token', () => {
    abrir('/painel')
    expect(screen.getByText('Visitante')).toBeTruthy()
    expect(screen.queryByText('Patrícia Lins')).toBeNull()
    expect(buscar).not.toHaveBeenCalled()
  })

  it('cancela o envio ao trocar de tela e não grava um token tardio', async () => {
    let resolver!: (r: Response) => void
    buscar.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolver = r
        }),
    )
    abrir()
    preencherLogin()
    fireEvent.submit(screen.getByRole('form', { name: 'Entrar' }))
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1))
    const sinal = buscar.mock.calls[0][1]!.signal!
    fireEvent.click(screen.getByRole('link', { name: 'Acessar cadastro' }))
    expect(sinal.aborted).toBe(true)
    await act(async () => resolver(resposta(sessao)))
    expect(tokenStorage.get()).toBeNull()
  })

  it('não entra quando o navegador bloqueia o armazenamento da sessão', async () => {
    vi.spyOn(tokenStorage, 'set').mockImplementation(() => {})
    buscar.mockResolvedValue(resposta(sessao))
    abrir()
    preencherLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Permita o armazenamento')
    expect(screen.getByLabelText('URL').textContent).toBe('/login')
  })
})
