import { describe, expect, it } from 'vitest'
import { destinoSeguro, nomeDoDestino, rotaDaPrevia } from './fluxo'

describe('destino da prévia de autenticação', () => {
  it.each([
    null,
    '',
    'https://externo.test',
    '//externo.test',
    '/\\externo.test',
    '/\n/externo.test',
    '/login',
    '/dev/auth/login',
    '/desconhecido',
    '/receita/../../login',
    'javascript:alert(1)',
  ])('não aceita destino externo, circular ou desconhecido: %s', (valor) => {
    expect(destinoSeguro(valor)).toBe('/painel')
  })

  it.each([
    '/painel',
    '/receita?municipio=RECIFE&bairro=BOA%20VISTA#ponte',
    '/unidades/UC-DEMO-001',
    '/perdas/ordens?status=ABERTA',
  ])('mantém uma rota válida e seus filtros: %s', (valor) => {
    expect(destinoSeguro(valor)).toBe(valor)
  })

  it('carrega apenas o destino seguro para a próxima etapa, sem propagar cenário de teste', () => {
    const rota = new URL(rotaDaPrevia('login', '/receita?municipio=RECIFE'), 'https://portal.test')
    expect(rota.pathname).toBe('/dev/auth/login')
    expect(rota.searchParams.get('destino')).toBe('/receita?municipio=RECIFE')
    expect(rota.searchParams.has('cenario')).toBe(false)
    expect(rotaDaPrevia('login', 'https://externo.test')).toBe('/dev/auth/login')
    expect(nomeDoDestino('/unidades/UC-DEMO-001')).toBe('Visão 360')
    expect(nomeDoDestino('/receita')).toBe('Diagnóstico da receita')
  })
})
