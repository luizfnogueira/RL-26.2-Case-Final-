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
  Resultado,
  StatusOrdem,
} from '@/types/inspecoes'
import { STATUS_ATIVOS } from '@/types/inspecoes'
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
import { compararPeriodos, invalido, paginacao, periodo, regiao, texto } from './validacao'

const SCORE_PRIORIZACAO = 60
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
  const { page, pageSize } = paginacao(params)
  const filtros = regiao(params)
  verificarCenario(atual, comparacao)

  const [base, e] = await Promise.all([fixtures.candidatos(), obterEstado()])
  const ativas = new Map(e.ordens.filter(ehAtiva).map((o) => [o.id_uc, o.id_ordem]))
  const candidatos = filtrarRegiao(base.items, filtros).sort(
    (a, b) => b.score - a.score || (a.id_uc < b.id_uc ? -1 : 1),
  )
  candidatos.forEach((c: Candidato, i) => {
    c.posicao = i + 1
    c.ordem_ativa = ativas.has(c.id_uc)
    c.id_ordem_ativa = ativas.get(c.id_uc) ?? null
  })
  const priorizados = candidatos.filter((c) => c.score >= SCORE_PRIORIZACAO)
  return {
    ...paginar(candidatos, page, pageSize),
    periodo_referencia: PERIODO_ATUAL,
    resumo: {
      ucs_analisadas: indicador(candidatos.length, 'UCs', PERIODO_ATUAL),
      ucs_priorizadas: indicador(priorizados.length, 'UCs', PERIODO_ATUAL),
      potencial_recuperacao: indicador(
        arredondar(priorizados.reduce((soma, c) => soma + (c.energia_estimada.valor ?? 0), 0)),
        'kWh',
        PERIODO_ATUAL,
      ),
      ordens_ativas: indicador(
        candidatos.filter((c) => c.ordem_ativa).length,
        'ordens',
        PERIODO_ATUAL,
      ),
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

export async function criarOrdem(corpo: Registro): Promise<Ordem> {
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

  const e = await obterEstado()
  if (!(idUc in e.cadastro)) {
    throw erroApi(
      404,
      'UC_INEXISTENTE',
      `Unidade Consumidora '${idUc}' não encontrada no cadastro.`,
    )
  }
  const ativa = e.ordens.find((o) => o.id_uc === idUc && ehAtiva(o))
  if (ativa) {
    throw erroApi(
      409,
      'ORDEM_ATIVA_EXISTENTE',
      `A Unidade Consumidora '${idUc}' já possui a ordem ativa #${ativa.id_ordem} com status '${ativa.status}'.`,
    )
  }

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
