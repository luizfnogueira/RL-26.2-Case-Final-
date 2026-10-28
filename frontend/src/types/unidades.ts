import type {
  FiltrosRegiao,
  Indicador,
  Mes,
  Metadados,
  Pagina,
  ParamsPaginacao,
  Periodo,
} from './comum'

export type TipoLeitura = 'REAL' | 'ESTIMADA' | 'MEDIA' | 'AUTENTICADA' | 'NAO REALIZADA'

/** Query de GET /unidades. */
export interface ParamsUnidades extends FiltrosRegiao, ParamsPaginacao {
  /** ID da UC ou nome do titular, de 3 a 100 caracteres. */
  busca?: string
}

/** Query de GET /unidades/{id}. */
export interface ParamsUnidade {
  /** Janela de exatamente 12 meses. Sem ela, a API usa os 12 meses até o último mês da Gold. */
  periodo_atual?: Periodo
}

export interface Unidade {
  id_uc: string
  nome_titular: string
  municipio: string
  bairro: string
  classe: string
  alimentador: string
  status: string
}

export interface Unidades extends Pagina<Unidade> {
  metadados: Metadados
}

export interface Cadastro extends Unidade {
  cpf_cnpj_mascarado: string
  /** Não há telefone na fonte bruta: pode ser null. */
  telefone: string | null
  logradouro: string
  numero: string
  uf: string
  cep: string | null
  subgrupo_tarifario: string
  data_ligacao: string | null
  latitude: number
  longitude: number
}

/** Um dos 12 meses: valor do mês e do mesmo mês do ano anterior. */
export interface ConsumoMes {
  mes: Mes
  atual: Indicador
  ano_anterior: Indicador
  tipo_leitura: TipoLeitura
}

/** Resposta à pergunta "a conta veio alta?" sobre o mês analisado. */
export interface DiagnosticoConta {
  /** Mês analisado: o último da janela com dado da UC. null se a janela não tem dados. */
  periodo_referencia: Mes | null
  conta_alta: boolean | null
  /** null quando a janela não tem dados da UC. */
  veredito: string | null
  ultimo_mes: Indicador
  mesmo_mes_ano_anterior: Indicador
  /** Média dos 12 meses anteriores ao mês analisado, sem incluí-lo, só com consumo > 0. */
  media_12_meses: Indicador
  /** Quantos meses entraram na média (0 a 12). */
  meses_media: number
  variacao_percentual: Indicador
  leitura_estimada: boolean
  alerta: string | null
}

export interface Fatura {
  id_fatura: string
  mes_referencia: Mes
  valor_energia: number
  tributos: number
  valor_total: number
  bandeira_tarifaria: string
  data_emissao: string
  data_vencimento: string
  data_pagamento: string | null
  /** Domínio da Gold: 'PAGA' ou 'EM ABERTO'. */
  status: string
}

export interface Leitura {
  data: string
  leitura_kwh: number
  tipo_leitura: TipoLeitura
}

export interface Medidor {
  id_medidor: string
  modelo: string
  tipo: string
  data_instalacao: string
  ultima_leitura: Leitura | null
}

export interface GeracaoDistribuida {
  potencia_kwp: number
  data_conexao: string
  modalidade: string
  /** Média cadastral injetada, não a geração medida no mês. */
  energia_injetada_media_mensal: Indicador
}

export interface Interrupcao {
  id_ocorrencia: string
  alimentador: string
  tipo: string
  causa: string
  data_abertura: string
  data_encerramento: string
  duracao_min: number
}

export interface Chamado {
  protocolo: string
  canal: string
  assunto: string
  subassunto: string
  data_abertura: string
  data_fechamento: string
  /** Nota não preenchida: null, nunca 0. */
  nota_satisfacao: number | null
  tempo_atendimento_h: number
}

export interface Unidade360 {
  periodo_referencia: Periodo
  cadastro: Cadastro
  consumo: ConsumoMes[]
  diagnostico_conta: DiagnosticoConta
  /** Faturas EM ABERTO de qualquer mês: estado atual do cliente, sem filtro de período. */
  faturas_abertas: Fatura[]
  /** Faturas PAGA com mes_referencia dentro da janela. */
  faturas_pagas: Fatura[]
  medidor: Medidor | null
  /** Bloco inteiro null para UC sem GD. */
  geracao_distribuida: GeracaoDistribuida | null
  /** Até 10, as mais recentes da janela, sem oscilação e sem anteriores à ligação. */
  interrupcoes_recentes: Interrupcao[]
  /** Todas as interrupções da janela, com as mesmas regras. */
  total_interrupcoes: Indicador
  chamados: Chamado[]
  metadados: Metadados
}
