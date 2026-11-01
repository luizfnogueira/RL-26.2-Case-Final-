import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import respostaOk from '@/data/mocks/resposta_ia.json'
import respostaBloqueada from '@/data/mocks/resposta_ia_bloqueado.json'
import respostaEsclarecer from '@/data/mocks/resposta_ia_esclarecer.json'
import respostaNaoSei from '@/data/mocks/resposta_ia_nao_sei.json'
import type { RespostaIA } from '@/types/ia'
import MensagemAssistente from './MensagemAssistente'

afterEach(cleanup)

function mostrar(resposta: RespostaIA) {
  render(
    <MensagemAssistente
      mensagem={{ id: '1', autor: 'assistente', estado: 'resposta', pergunta: 'p', resposta }}
      aoTentarNovamente={() => {}}
      aoEscolher={() => {}}
      enviando={false}
    />,
  )
}

// A data sai no fuso de quem roda o teste, como na tela
const CARGA = new Date('2026-10-21T06:15:00-03:00').toLocaleDateString('pt-BR')

describe('Tela 7 — rodapé da base', () => {
  it.each([
    ['ok', respostaOk],
    ['não sei', respostaNaoSei],
  ])('resposta %s mostra até quando vão os dados e quando a base foi carregada', (_, resposta) => {
    mostrar(resposta as RespostaIA)
    expect(screen.getByText(`Dados até Jun/2026 · base carregada em ${CARGA}`)).toBeTruthy()
  })

  it('sem data da carga, mostra só até quando vão os dados', () => {
    const semCarga = {
      ...(respostaOk as RespostaIA),
      metadados: { ...(respostaOk as RespostaIA).metadados, gold_atualizada_em: null },
    }
    mostrar(semCarga)
    expect(screen.getByText('Dados até Jun/2026')).toBeTruthy()
  })

  it.each([
    ['bloqueada', respostaBloqueada],
    ['de esclarecimento', respostaEsclarecer],
  ])('resposta %s não tem rodapé: nada foi consultado', (_, resposta) => {
    mostrar(resposta as RespostaIA)
    expect(screen.queryByText(/Dados até/)).toBeNull()
  })
})
