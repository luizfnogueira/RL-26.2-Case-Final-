// Mock da API V2: atende as mesmas rotas e erros do stub do backend, sem rede. Carregado sob
// demanda por services/http.ts quando VITE_USE_MOCKS=true.
import type { Metodo, OpcoesRequisicao } from '../http'
import { montarDashboard } from './dashboard'
import { listarFiltros } from './filtros'
import { gerarInsightMock, responderPergunta } from './ia'
import { atualizarOrdem, criarOrdem, listarCandidatos, listarOrdens } from './ordens'
import { montarOperacao } from './operacao'
import { detalharUnidade, listarUnidades } from './unidades'
import { atrasar, clonar, erroApi, type Registro } from './util'

export { reiniciarOrdens } from './ordens'

/** Valida o corpo e devolve uma cópia: os handlers nunca alteram o objeto do chamador. */
function corpoComoRegistro(corpo: unknown): Registro {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    throw erroApi(422, 'DADOS_INVALIDOS', 'O corpo da requisição deve ser um objeto JSON.')
  }
  return clonar(corpo as Registro)
}

function exigirMetodo(metodo: Metodo, esperado: Metodo) {
  if (metodo !== esperado) {
    throw erroApi(405, 'METODO_NAO_PERMITIDO', `Método ${metodo} não permitido para esta rota.`)
  }
}

export async function atenderMock(
  metodo: Metodo,
  caminho: string,
  { params, corpo, sinal }: OpcoesRequisicao = {},
): Promise<unknown> {
  await atrasar(sinal)
  const consulta = (params ?? {}) as Registro
  const [recurso, segundo] = caminho.split('/').filter(Boolean).map(decodeURIComponent)

  switch (recurso) {
    case 'health':
      exigirMetodo(metodo, 'GET')
      return { status: 'ok' }
    case 'dashboard':
      exigirMetodo(metodo, 'GET')
      return montarDashboard(consulta)
    case 'filtros':
      exigirMetodo(metodo, 'GET')
      return listarFiltros()
    case 'unidades':
      exigirMetodo(metodo, 'GET')
      return segundo === undefined ? listarUnidades(consulta) : detalharUnidade(segundo, consulta)
    case 'operacao':
      exigirMetodo(metodo, 'GET')
      return montarOperacao(consulta)
    case 'inspecoes':
      if (segundo === 'candidatos') {
        exigirMetodo(metodo, 'GET')
        return listarCandidatos(consulta)
      }
      if (segundo === undefined) {
        if (metodo === 'GET') return listarOrdens(consulta)
        exigirMetodo(metodo, 'POST')
        return criarOrdem(corpoComoRegistro(corpo))
      }
      exigirMetodo(metodo, 'PATCH')
      return atualizarOrdem(Number(segundo), corpoComoRegistro(corpo))
    case 'ia':
      exigirMetodo(metodo, 'POST')
      return segundo === 'insight'
        ? gerarInsightMock(corpoComoRegistro(corpo))
        : responderPergunta(corpoComoRegistro(corpo))
    default:
      throw erroApi(404, 'RECURSO_NAO_ENCONTRADO', `Rota ${caminho} não encontrada.`)
  }
}
