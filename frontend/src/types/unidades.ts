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
  /** ID da UC ou nome do titular, de 1 a 100 caracteres. */
  busca?: string
}

/** Query de GET /unidades/{id}. */
export interface ParamsUnidade {
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
  latitude: number | null
  longitude: number | null
}

/** Um dos 12 meses: valor do mês e do mesmo mês do ano anterior. */
export interface ConsumoMes {
  mes: Mes
  atual: Indicador
  ano_anterior: Indicador
  tipo_leitura: TipoLeitura
}

/** Resposta à pergunta "a conta veio alta?". A regra real pertence à V1a. */
export interface DiagnosticoConta {
  conta_alta: boolean | null
  veredito: string
  ultimo_mes: Indicador
  mesmo_mes_ano_anterior: Indicador
  media_12_meses: Indicador
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
  data_encerramento: string | null
  duracao_min: number | null
}

export interface Chamado {
  protocolo: string
  canal: string
  assunto: string
  subassunto: string | null
  data_abertura: string
  data_fechamento: string | null
  nota_satisfacao: number | null
  tempo_atendimento_h: number | null
}

export interface Unidade360 {
  periodo_referencia: Periodo
  cadastro: Cadastro
  consumo: ConsumoMes[]
  diagnostico_conta: DiagnosticoConta
  faturas_abertas: Fatura[]
  faturas_pagas: Fatura[]
  medidor: Medidor | null
  geracao_distribuida: GeracaoDistribuida | null
  interrupcoes_recentes: Interrupcao[]
  chamados: Chamado[]
  metadados: Metadados
}
