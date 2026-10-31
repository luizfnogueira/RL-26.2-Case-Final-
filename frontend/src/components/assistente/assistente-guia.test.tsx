import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import exemploDados from '@/data/mocks/resposta_ia.json'
import exemploGuia from '@/data/mocks/resposta_ia_guia.json'
import type { RespostaIA } from '@/types/ia'
import ComoCheguei from './ComoCheguei'

// Pergunta sobre o uso da plataforma (contrato, seção 9): a resposta vem do guia, sem SQL nem dados.
afterEach(cleanup)

const resposta = (exemplo: unknown) => structuredClone(exemplo) as RespostaIA

function abrirAuditoria(r: RespostaIA) {
  render(<ComoCheguei resposta={r} />)
  fireEvent.click(screen.getByRole('button', { name: 'Como cheguei nisso' }))
}

describe('"Como cheguei nisso" de resposta do guia', () => {
  it('mostra a fonte e as seções do guia no lugar do SQL', () => {
    abrirAuditoria(resposta(exemploGuia))
    expect(screen.getByText('Guia da plataforma')).toBeTruthy()
    expect(screen.getByText('Assistente V-Energy')).toBeTruthy()
    expect(screen.queryByText('Consulta gerada (somente leitura)')).toBeNull()
  })

  it('resposta de dados continua mostrando o SQL', () => {
    abrirAuditoria(resposta(exemploDados))
    expect(screen.getByText('Consulta gerada (somente leitura)')).toBeTruthy()
    expect(screen.queryByText('Guia da plataforma')).toBeNull()
  })

  it('resposta do guia sem seções (não sei) não abre auditoria vazia', () => {
    const r = resposta(exemploGuia)
    r.status = 'nao_sei'
    r.metadados.secoes_guia = []
    render(<ComoCheguei resposta={r} />)
    expect(screen.queryByRole('button', { name: 'Como cheguei nisso' })).toBeNull()
  })
})
