// Fila e ordens simuladas. Porta de stub_inspecoes.py e das regras de inspecao_service.py.
// Diferença proposital: o stub do backend recria o snapshot a cada chamada; aqui as ordens
// ficam em memória durante a sessão, para a Tela 4 → Tela 5 funcionar de ponta a ponta.
// Recarregar a página volta ao snapshot original.
import type {
  Candidato,
  Candidatos,
  Historico,
  Ordem,
  Ordens,
  OrdensCriadas,
  Resultado,
  StatusOrdem,
} from '@/types/inspecoes'
import { STATUS_ATIVOS } from '@/types/inspecoes'
import { ApiError } from '../erro-api'
import { mesNoPeriodo } from '@/utils/periodos'
import { fixtures } from './fixtures'
import {
  PERIODO_ATUAL,
  agoraIso,
  arredondar,
  clonar,
  erroApi,
  filtrarRegiao,
  indicador,
  paginar,
  verificarCenario,
  type Registro,
} from './util'
import {
  booleano,
  compararPeriodos,
  invalido,
  paginacao,
  paginacaoCandidatos,
  periodo,
  regiao,
  texto,
} from './validacao'

const STATUS: StatusOrdem[] = ['ABERTA', 'EM_CAMPO', 'CONCLUIDA', 'CANCELADA']

interface Estado {
  ordens: Ordem[]
  proximoIdOrdem: number
  proximoIdHistorico: number
  cadastro: Record<string, Registro>
}

let estado: Estado | null = null

async function obterEstado(): Promise<Estado> {
  if (estado) return estado
  const [base, unidades] = await Promise.all([fixtures.inspecoes(), fixtures.unidades()])
  const ordens = [...base.items].sort((a, b) => a.id_ordem - b.id_ordem)
  const historicos = ordens.flatMap((o) => o.historico.map((h) => h.id_historico))
  estado = {
    ordens,
    proximoIdOrdem: Math.max(0, ...ordens.map((o) => o.id_ordem)) + 1,
    proximoIdHistorico: Math.max(0, ...historicos) + 1,
    cadastro: Object.fromEntries(unidades.items.map((uc) => [uc.id_uc, uc as unknown as Registro])),
  }
  return estado
}

/** Volta as ordens ao snapshot original (usado nos testes). */
export function reiniciarOrdens(): void {
  estado = null
}

const ehAtiva = (ordem: Ordem) => STATUS_ATIVOS.includes(ordem.status)

/** Como a API: UC com inspeção concluída nos últimos 6 meses sai da fila. */
const MESES_SEM_REINSPECAO = 6
function inspecionadaRecentemente(ordem: Ordem): boolean {
  if (ordem.status !== 'CONCLUIDA' || !ordem.data_conclusao) return false
  const limite = new Date()
  limite.setMonth(limite.getMonth() - MESES_SEM_REINSPECAO)
  return new Date(ordem.data_conclusao) >= limite
}

function novoHistorico(
  e: Estado,
  ordem: Ordem,
  anterior: StatusOrdem | null,
  extra: Partial<Historico>,
): Historico {
  const evento: Historico = {
    id_historico: e.proximoIdHistorico++,
    id_ordem: ordem.id_ordem,
    status_anterior: anterior,
    status_novo: ordem.status,
    data_mudanca: agoraIso(),
    usuario: null,
    justificativa_ou_motivo: null,
    detalhes: null,
    ...extra,
  }
  ordem.historico.push(evento)
  return evento
}

// ---------- Fila ----------

export async function listarCandidatos(params: Registro): Promise<Candidatos> {
  const atual = periodo(params, 'periodo_atual', true)
  const comparacao = periodo(params, 'periodo_comparacao', false)
  compararPeriodos(atual, comparacao)
  const { page, pageSize } = paginacaoCandidatos(params)
  const filtros = regiao(params)
  const semOrdemAtiva = booleano(params, 'sem_ordem_ativa')
  verificarCenario(atual, comparacao)

  const [base, cadastro, e] = await Promise.all([
    fixtures.candidatos(),
    fixtures.unidades(),
    obterEstado(),
  ])
  const ativas = new Map(e.ordens.filter(ehAtiva).map((o) => [o.id_uc, o.id_ordem]))
  // Mesma ordem de gold.tb_fila_perdas: score, kWh estimado e id_uc (contrato Gold, regra 4.10).
  const inspecionadas = new Set(e.ordens.filter(inspecionadaRecentemente).map((o) => o.id_uc))
  const candidatos = filtrarRegiao(
    base.items.filter((c) => !inspecionadas.has(c.id_uc)),
    filtros,
  ).sort(
    (a, b) =>
      b.score - a.score ||
      (b.energia_estimada.valor ?? 0) - (a.energia_estimada.valor ?? 0) ||
      (a.id_uc < b.id_uc ? -1 : 1),
  )
  candidatos.forEach((c: Candidato) => {
    c.ordem_ativa = ativas.has(c.id_uc)
    c.id_ordem_ativa = ativas.get(c.id_uc) ?? null
  })
  const fila = candidatos.filter((c) => !semOrdemAtiva || !c.ordem_ativa)
  fila.forEach((c, i) => {
    c.posicao = i + 1
  })
  // Como na Gold: analisadas = UCs do cadastro (universo da auditoria); priorizadas = UCs na fila
  // (todas elegíveis, sem corte de score); potencial = Σ kwh_estimado, um proxy, não energia comprovada.
  const analisadas = filtrarRegiao(cadastro.items, filtros)
  const priorizados = fila
  return {
    ...paginar(fila, page, pageSize),
    periodo_referencia: PERIODO_ATUAL,
    resumo: {
      ucs_analisadas: indicador(analisadas.length, 'UCs', PERIODO_ATUAL),
      ucs_priorizadas: indicador(priorizados.length, 'UCs', PERIODO_ATUAL),
      potencial_recuperacao: indicador(
        arredondar(priorizados.reduce((soma, c) => soma + (c.energia_estimada.valor ?? 0), 0)),
        'kWh',
        PERIODO_ATUAL,
      ),
      ordens_ativas: indicador(fila.filter((c) => c.ordem_ativa).length, 'ordens', PERIODO_ATUAL),
    },
    metadados: base.metadados,
  }
}

// ---------- Listagem ----------

export async function listarOrdens(params: Registro): Promise<Ordens> {
  const status = texto(params, 'status')
  if (status !== undefined && !STATUS.includes(status as StatusOrdem))
    throw invalido('status inválido.')
  const mes = periodo(params, 'periodo_atual', false)
  const { page, pageSize } = paginacao(params)
  const filtros = regiao(params)
  const idUc = texto(params, 'id_uc')

  const e = await obterEstado()
  const base = await fixtures.inspecoes()
  let ordens = filtrarRegiao(e.ordens, filtros, e.cadastro)
  if (idUc) ordens = ordens.filter((o) => o.id_uc === idUc)
  if (mes) ordens = ordens.filter((o) => mesNoPeriodo(o.data_criacao.slice(0, 7), mes))
  const contagem = Object.fromEntries(
    STATUS.map((s) => [s, ordens.filter((o) => o.status === s).length]),
  ) as Ordens['contagem_status']
  if (status) ordens = ordens.filter((o) => o.status === status)
  ordens = [...ordens].sort(
    (a, b) => b.data_criacao.localeCompare(a.data_criacao) || a.id_ordem - b.id_ordem,
  )
  return {
    ...paginar(clonar(ordens), page, pageSize),
    contagem_status: contagem,
    metadados: base.metadados,
  }
}

// ---------- Criação ----------

function textoOpcional(corpo: Registro, campo: string, max = 2000): string | null {
  const valor = corpo[campo]
  if (valor === undefined || valor === null) return null
  if (typeof valor !== 'string' || valor.length > max) throw invalido(`${campo} inválido.`)
  return valor.trim() || null
}

function dataOpcional(corpo: Registro, campo: string): string | null {
  const valor = corpo[campo]
  if (valor === undefined || valor === null || valor === '') return null
  if (
    typeof valor !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor) ||
    Number.isNaN(Date.parse(valor))
  ) {
    throw invalido(`${campo} deve estar no formato YYYY-MM-DD.`)
  }
  return valor
}

const MAX_ORDENS_LOTE = 200

/** As validações do POST /inspecoes, sem gravar: devolve os campos já limpos ou lança o erro da API. */
async function validarCriacao(corpo: Registro, e: Estado) {
  const idUc = typeof corpo.id_uc === 'string' ? corpo.id_uc.trim() : ''
  const equipe = typeof corpo.equipe_responsavel === 'string' ? corpo.equipe_responsavel.trim() : ''
  if (!idUc) throw invalido('id_uc é obrigatório.')
  if (!equipe) throw invalido('equipe_responsavel é obrigatória.')
  const dataPrevista = dataOpcional(corpo, 'data_prevista')
  const motivo = textoOpcional(corpo, 'motivo')
  const observacoes = textoOpcional(corpo, 'observacoes')
  let kwh: number | null = null
  if (corpo.kwh_estimado !== undefined && corpo.kwh_estimado !== null) {
    kwh = Number(corpo.kwh_estimado)
    if (!Number.isFinite(kwh) || kwh < 0)
      throw invalido('kwh_estimado deve ser maior ou igual a zero.')
  }

  if (!(idUc in e.cadastro)) {
    throw erroApi(
      404,
      'UC_INEXISTENTE',
      `Unidade Consumidora '${idUc}' não encontrada no cadastro.`,
    )
  }
  const candidatos = await fixtures.candidatos()
  const candidato = candidatos.items.find((item) => item.id_uc === idUc)
  if (candidato?.acao_recomendada === 'VALIDACAO_DOCUMENTAL') {
    throw erroApi(422, 'DADOS_INVALIDOS', 'UC requer validação documental antes de gerar inspeção.')
  }
  const ativa = e.ordens.find((o) => o.id_uc === idUc && ehAtiva(o))
  if (ativa) {
    throw erroApi(
      409,
      'ORDEM_ATIVA_EXISTENTE',
      `A Unidade Consumidora '${idUc}' já possui a ordem ativa #${ativa.id_ordem} com status '${ativa.status}'.`,
    )
  }
  return { idUc, equipe, dataPrevista, motivo, observacoes, kwh }
}

function gravarOrdem(e: Estado, campos: Awaited<ReturnType<typeof validarCriacao>>): Ordem {
  const { idUc, equipe, dataPrevista, motivo, observacoes, kwh } = campos
  const ordem: Ordem = {
    id_ordem: e.proximoIdOrdem++,
    id_uc: idUc,
    status: 'ABERTA',
    equipe_responsavel: equipe,
    data_criacao: agoraIso(),
    data_prevista: dataPrevista,
    data_inicio_campo: null,
    data_conclusao: null,
    data_cancelamento: null,
    justificativa_cancelamento: null,
    motivo,
    kwh_estimado: kwh,
    observacoes,
    resultado: null,
    historico: [],
  }
  novoHistorico(e, ordem, null, {
    data_mudanca: ordem.data_criacao,
    justificativa_ou_motivo: motivo ?? 'Criação da ordem de inspeção',
    detalhes: { equipe, data_prevista: dataPrevista },
  })
  e.ordens.push(ordem)
  return clonar(ordem)
}

export async function criarOrdem(corpo: Registro): Promise<Ordem> {
  const e = await obterEstado()
  return gravarOrdem(e, await validarCriacao(corpo, e))
}

/** Como o POST /inspecoes/lote: valida todas antes de gravar; uma falha rejeita o lote inteiro. */
export async function criarOrdensEmLote(corpo: Registro): Promise<OrdensCriadas> {
  const lista = corpo.ordens
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > MAX_ORDENS_LOTE)
    throw invalido(`ordens deve ter de 1 a ${MAX_ORDENS_LOTE} itens.`)
  const e = await obterEstado()
  const validas: Awaited<ReturnType<typeof validarCriacao>>[] = []
  const falhas: { id_uc: string; codigo: string; mensagem: string }[] = []
  const vistas = new Set<string>()
  for (const item of lista as Registro[]) {
    const idUc = typeof item.id_uc === 'string' ? item.id_uc.trim() : ''
    try {
      if (vistas.has(idUc))
        throw erroApi(
          409,
          'ORDEM_ATIVA_EXISTENTE',
          `A Unidade Consumidora '${idUc}' aparece mais de uma vez no lote.`,
        )
      vistas.add(idUc)
      validas.push(await validarCriacao(item, e))
    } catch (erro) {
      if (!(erro instanceof ApiError)) throw erro
      falhas.push({ id_uc: idUc, codigo: erro.codigo, mensagem: erro.mensagem })
    }
  }
  if (falhas.length > 0)
    throw erroApi(
      422,
      'LOTE_REJEITADO',
      'Nenhuma ordem do lote foi criada: corrija as UCs listadas em detalhes.falhas.',
      { falhas },
    )
  const items = validas.map((campos) => gravarOrdem(e, campos))
  return { items, total: items.length }
}

// ---------- Atualização ----------

function validarResultado(bruto: unknown): Resultado {
  if (typeof bruto !== 'object' || bruto === null) throw invalido('resultado inválido.')
  const r = bruto as Registro
  if (typeof r.irregularidade_detectada !== 'boolean')
    throw invalido('irregularidade_detectada é obrigatório.')
  const observacoes = typeof r.observacoes === 'string' ? r.observacoes.trim() : ''
  if (!observacoes || observacoes.length > 2000)
    throw invalido('observacoes é obrigatório (até 2000 caracteres).')
  const kwh =
    r.kwh_recuperado === undefined || r.kwh_recuperado === null ? 0 : Number(r.kwh_recuperado)
  if (!Number.isFinite(kwh) || kwh < 0)
    throw invalido('kwh_recuperado deve ser maior ou igual a zero.')
  const tipo =
    typeof r.tipo_irregularidade === 'string'
      ? r.tipo_irregularidade.trim().toUpperCase() || null
      : null
  if (r.irregularidade_detectada && !tipo) throw invalido('Informe o tipo de irregularidade.')
  if (!r.irregularidade_detectada && (kwh > 0 || tipo)) {
    throw invalido('Sem irregularidade: tipo vazio e kwh_recuperado igual a zero.')
  }
  return {
    irregularidade_detectada: r.irregularidade_detectada,
    tipo_irregularidade: r.irregularidade_detectada ? tipo : null,
    kwh_recuperado: r.irregularidade_detectada ? kwh : 0,
    observacoes,
    data_inspecao: typeof r.data_inspecao === 'string' ? r.data_inspecao : null,
    inspetor: typeof r.inspetor === 'string' && r.inspetor.trim() ? r.inspetor.trim() : null,
  }
}

export async function atualizarOrdem(id: number, corpo: Registro): Promise<Ordem> {
  if (!Number.isInteger(id) || id < 1) throw invalido('O id da ordem deve ser um inteiro positivo.')
  const status = corpo.status as StatusOrdem
  if (!STATUS.includes(status)) throw invalido('status inválido.')
  const equipe = textoOpcional(corpo, 'equipe_responsavel')
  const observacoes = textoOpcional(corpo, 'observacoes')
  const justificativa = textoOpcional(corpo, 'justificativa')
  if (status !== 'EM_CAMPO' && (equipe !== null || observacoes !== null)) {
    throw invalido('equipe_responsavel e observacoes só são aceitos ao iniciar campo.')
  }
  if (status !== 'CONCLUIDA' && corpo.resultado !== undefined && corpo.resultado !== null) {
    throw invalido('resultado só é aceito na conclusão.')
  }
  if (status !== 'CANCELADA' && justificativa !== null) {
    throw invalido('justificativa só é aceita no cancelamento.')
  }
  const resultado = corpo.resultado ? validarResultado(corpo.resultado) : null

  const e = await obterEstado()
  const ordem = e.ordens.find((o) => o.id_ordem === id)
  if (!ordem) throw erroApi(404, 'ORDEM_NAO_ENCONTRADA', `Ordem de inspeção #${id} não encontrada.`)
  const anterior = ordem.status
  const agora = agoraIso()
  const transicao = (msg: string) =>
    erroApi(
      400,
      'TRANSICAO_INVALIDA',
      `Transição inválida: a ordem #${id} está '${anterior}'. ${msg}`,
    )

  if (status === 'EM_CAMPO') {
    if (anterior !== 'ABERTA')
      throw transicao("Apenas ordens no status 'ABERTA' podem avançar para 'EM_CAMPO'.")
    ordem.status = 'EM_CAMPO'
    ordem.data_inicio_campo = agora
    if (equipe) ordem.equipe_responsavel = equipe
    if (observacoes)
      ordem.observacoes = ordem.observacoes
        ? `${ordem.observacoes}\n[Despacho] ${observacoes}`
        : observacoes
    novoHistorico(e, ordem, anterior, {
      data_mudanca: agora,
      justificativa_ou_motivo: 'Ordem despachada para execução em campo.',
      detalhes: { equipe: ordem.equipe_responsavel, inicio_campo: agora },
    })
  } else if (status === 'CANCELADA') {
    if (!justificativa)
      throw erroApi(
        400,
        'JUSTIFICATIVA_OBRIGATORIA',
        'Informe a justificativa para cancelar a ordem.',
      )
    if (!ehAtiva(ordem))
      throw transicao("Apenas ordens 'ABERTA' ou 'EM_CAMPO' podem ser canceladas.")
    ordem.status = 'CANCELADA'
    ordem.justificativa_cancelamento = justificativa
    ordem.data_cancelamento = agora
    novoHistorico(e, ordem, anterior, {
      data_mudanca: agora,
      justificativa_ou_motivo: `Cancelamento: ${justificativa}`,
      detalhes: { justificativa },
    })
  } else if (status === 'CONCLUIDA') {
    if (!resultado)
      throw erroApi(
        400,
        'RESULTADO_INCOMPLETO',
        'Informe o resultado da inspeção para concluir a ordem.',
      )
    if (anterior === 'ABERTA')
      throw transicao(
        "É obrigatório avançar para 'EM_CAMPO' antes de concluir com o resultado da vistoria.",
      )
    if (anterior !== 'EM_CAMPO')
      throw transicao("Apenas ordens no status 'EM_CAMPO' podem ser concluídas.")
    ordem.status = 'CONCLUIDA'
    ordem.resultado = resultado
    ordem.data_conclusao = resultado.data_inspecao ?? agora
    novoHistorico(e, ordem, anterior, {
      data_mudanca: agora,
      justificativa_ou_motivo: `Inspeção concluída: ${resultado.irregularidade_detectada ? 'IRREGULARIDADE CONFIRMADA' : 'SEM IRREGULARIDADE'}.`,
      detalhes: { ...resultado },
    })
  } else {
    throw erroApi(400, 'TRANSICAO_INVALIDA', 'Uma ordem não pode voltar para ABERTA.')
  }
  return clonar(ordem)
}
