/**
 * Verificação em tempo de compilação: cada fixture do contrato V2 precisa ter o formato dos
 * tipos de `types/`. Se o backend mudar um fixture (e `npm run mocks:sync` o trouxer para cá)
 * ou um tipo ficar desatualizado, `npm run typecheck` falha.
 *
 * Este arquivo não é importado pelo app e não entra no bundle.
 */
import ordemAtualizada from '@/data/mocks/ordem_atualizada.json'
import ordemCriada from '@/data/mocks/ordem_criada.json'
import candidatos from '@/data/mocks/candidatos.json'
import cancelarInspecao from '@/data/mocks/cancelar_inspecao.json'
import concluirInspecao from '@/data/mocks/concluir_inspecao.json'
import criarInspecao from '@/data/mocks/criar_inspecao.json'
import dashboard from '@/data/mocks/dashboard.json'
import erro from '@/data/mocks/erro.json'
import iniciarInspecao from '@/data/mocks/iniciar_inspecao.json'
import inspecoes from '@/data/mocks/inspecoes.json'
import operacao from '@/data/mocks/operacao.json'
import pedidoInsight from '@/data/mocks/pedido_insight.json'
import pedidoInsightUnidade from '@/data/mocks/pedido_insight_unidade.json'
import perguntaIa from '@/data/mocks/pergunta_ia.json'
import respostaIa from '@/data/mocks/resposta_ia.json'
import respostaIaBloqueado from '@/data/mocks/resposta_ia_bloqueado.json'
import respostaIaNaoSei from '@/data/mocks/resposta_ia_nao_sei.json'
import respostaInsight from '@/data/mocks/resposta_insight.json'
import respostaInsightUnidade from '@/data/mocks/resposta_insight_unidade.json'
import unidade from '@/data/mocks/unidade.json'
import unidades from '@/data/mocks/unidades.json'
import type { ErroApiCorpo } from './comum'
import type { Dashboard } from './dashboard'
import type { PedidoInsight, PerguntaIA, RespostaIA, RespostaInsight } from './ia'
import type {
  CancelarInspecao,
  Candidatos,
  ConcluirInspecao,
  CriarInspecao,
  IniciarCampo,
  Ordem,
  Ordens,
} from './inspecoes'
import type { Operacao } from './operacao'
import type { Unidade360, Unidades } from './unidades'

// O JSON importado tem `string` onde o tipo tem uniões literais ('ABERTA' etc.); a conferência
// de literais fica por conta dos testes dos mocks.
type Largo<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Largo<U>[]
    : T extends object
      ? { [K in keyof T]: Largo<T[K]> }
      : T

export const fixturesConferidos = {
  dashboard: dashboard satisfies Largo<Dashboard>,
  unidades: unidades satisfies Largo<Unidades>,
  unidade: unidade satisfies Largo<Unidade360>,
  candidatos: candidatos satisfies Largo<Candidatos>,
  inspecoes: inspecoes satisfies Largo<Ordens>,
  ordemCriada: ordemCriada satisfies Largo<Ordem>,
  ordemAtualizada: ordemAtualizada satisfies Largo<Ordem>,
  operacao: operacao satisfies Largo<Operacao>,
  respostaIa: respostaIa satisfies Largo<RespostaIA>,
  respostaIaNaoSei: respostaIaNaoSei satisfies Largo<RespostaIA>,
  respostaIaBloqueado: respostaIaBloqueado satisfies Largo<RespostaIA>,
  respostaInsight: respostaInsight satisfies Largo<RespostaInsight>,
  respostaInsightUnidade: respostaInsightUnidade satisfies Largo<RespostaInsight>,
  perguntaIa: perguntaIa satisfies Largo<PerguntaIA>,
  pedidoInsight: pedidoInsight satisfies Largo<PedidoInsight>,
  pedidoInsightUnidade: pedidoInsightUnidade satisfies Largo<PedidoInsight>,
  criarInspecao: criarInspecao satisfies Largo<CriarInspecao>,
  iniciarInspecao: iniciarInspecao satisfies Largo<IniciarCampo>,
  concluirInspecao: concluirInspecao satisfies Largo<ConcluirInspecao>,
  cancelarInspecao: cancelarInspecao satisfies Largo<CancelarInspecao>,
  erro: erro satisfies Largo<ErroApiCorpo>,
}
