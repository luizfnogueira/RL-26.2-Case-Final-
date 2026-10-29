import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PrototipoAuthPage from './PrototipoAuthPage'

function Endereco() {
  const { pathname, search, hash } = useLocation()
  return (
    <output aria-label="Endereço da prévia">
      {pathname}
      {search}
      {hash}
    </output>
  )
}
function abrir(url = '/dev/auth/login') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dev/auth" element={<Navigate to="/dev/auth/login" replace />} />
        <Route path="/dev/auth/:etapa" element={<PrototipoAuthPage />} />
        <Route path="/painel" element={<p>Painel existente da equipe</p>} />
        <Route path="/receita" element={<p>Receita existente da equipe</p>} />
      </Routes>
      <Endereco />
    </MemoryRouter>,
  )
}

function revisar() {
  const botao = screen.getByRole('button', { name: 'Revisar fluxo' })
  if (botao.getAttribute('aria-expanded') !== 'true') fireEvent.click(botao)
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
  it('mantém os controles de revisão recolhidos na experiência inicial', () => {
    abrir()
    expect(
      screen.getByRole('button', { name: 'Revisar fluxo' }).getAttribute('aria-expanded'),
    ).toBe('false')
    expect(screen.queryByRole('combobox', { name: 'Resultado simulado' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Telas do protótipo' })).toBeNull()
    revisar()
    expect(screen.getByRole('combobox', { name: 'Resultado simulado' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Telas do protótipo' })).toBeTruthy()
  })

  it('leva o foco ao primeiro campo inválido e não o rouba durante a correção', () => {
    abrir()
    fireEvent.submit(screen.getByRole('form', { name: 'Entrar no protótipo' }))
    const email = screen.getByLabelText('E-mail')
    expect(screen.getByText('Informe seu e-mail.')).toBeTruthy()
    expect(screen.getByText('Informe sua senha.')).toBeTruthy()
    expect(document.activeElement).toBe(email)
    fireEvent.change(email, { target: { value: 'artur@venergy.test' } })
    expect(document.activeElement).toBe(email)
    expect(screen.queryByText('Informe seu e-mail.')).toBeNull()
  })

  it('valida formato de e-mail e tamanho da senha de cadastro com mensagens no campo', () => {
    abrir('/dev/auth/cadastro')
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'email-invalido' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'curta' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'curta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    expect(screen.getByText('Confira o formato do e-mail.')).toBeTruthy()
    expect(screen.getByText('Use pelo menos 8 caracteres.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('E-mail'))
  })

  it('reaproveita o e-mail cadastrado no login sem reaproveitar senha ou convite', async () => {
    abrir('/dev/auth/cadastro')
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'artur.novo@venergy.test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }))
    await screen.findByRole('heading', { name: 'Seu acesso está pronto' })
    fireEvent.click(screen.getByRole('button', { name: 'Ir para login' }))
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe(
      'artur.novo@venergy.test',
    )
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('link', { name: 'Criar acesso com convite' }))
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Artur')
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe(
      'artur.novo@venergy.test',
    )
    for (const rotulo of ['Senha', 'Confirmar senha', 'Código de convite']) {
      expect((screen.getByLabelText(rotulo) as HTMLInputElement).value).toBe('')
    }
  })

  it('preserva o destino e o recorte ao passar pela expiração e pelo novo login', async () => {
    const destino = '/receita?municipio=RECIFE&periodo_atual=2025-07%2F2026-06'
    abrir(`/dev/auth/sessao?${new URLSearchParams({ destino })}`)
    fireEvent.click(screen.getByRole('button', { name: 'Simular sessão expirada' }))
    expect(screen.getByText('Seu próximo destino está salvo.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar novamente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    const continuar = await screen.findByRole('link', {
      name: 'Continuar para Diagnóstico da receita',
    })
    expect(continuar.getAttribute('href')).toBe(destino)
    fireEvent.click(continuar)
    expect(screen.getByText('Receita existente da equipe')).toBeTruthy()
    expect(screen.getByLabelText('Endereço da prévia').textContent).toBe(destino)
  })

  it('descarta cenários de erro ao trocar de etapa e reinicia os campos sem guardar credenciais', async () => {
    abrir()
    revisar()
    fireEvent.change(screen.getByRole('combobox', { name: 'Resultado simulado' }), {
      target: { value: 'invalido' },
    })
    fireEvent.click(screen.getByRole('link', { name: 'Cadastro' }))
    expect(
      (screen.getByRole('combobox', { name: 'Resultado simulado' }) as HTMLSelectElement).value,
    ).toBe('normal')
    fireEvent.click(screen.getByRole('link', { name: 'Login' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar prévia' }))
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('')
    expect(localStorage.length).toBe(0)
  })

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
    expect(screen.getByText('Artur')).toBeTruthy()
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
    revisar()
    fireEvent.change(screen.getByRole('combobox', { name: 'Resultado simulado' }), {
      target: { value: 'invalido' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preencher exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('E-mail ou senha inválidos')
    expect(document.activeElement).toBe(screen.getByRole('alert'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Resultado simulado' }), {
      target: { value: 'normal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('heading', { name: 'Você está no portal' })).toBeTruthy()
  })

  it('simula indisponibilidade preservando os campos para nova tentativa', async () => {
    abrir()
    revisar()
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
    revisar()
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
    revisar()
    fireEvent.click(screen.getByRole('link', { name: 'Sessão' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sair da demonstração' }))
    expect(screen.getByLabelText('Endereço da prévia').textContent).toBe('/dev/auth/login')
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('')
  })

  it('cancela o envio visual se a pessoa mudar de tela', async () => {
    vi.useFakeTimers()
    abrir()
    revisar()
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
