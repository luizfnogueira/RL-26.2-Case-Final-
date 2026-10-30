import { duracaoEmMeses, periodoValido } from '@/utils/periodos'
import { erroApi, type Registro } from './util'

/** Erro 422 DADOS_INVALIDOS, o mesmo que o FastAPI devolve para parâmetros fora do contrato. */
export function invalido(mensagem: string) {
  return erroApi(422, 'DADOS_INVALIDOS', mensagem)
}

function vazio(valor: unknown): boolean {
  return valor === undefined || valor === null || valor === ''
}

export function texto(params: Registro, campo: string): string | undefined {
  const valor = params[campo]
  return vazio(valor) ? undefined : String(valor)
}

export function inteiro(
  params: Registro,
  campo: string,
  { padrao, min, max }: { padrao: number; min: number; max?: number },
): number {
  if (vazio(params[campo])) return padrao
  const numero = Number(params[campo])
  if (!Number.isInteger(numero) || numero < min || (max !== undefined && numero > max)) {
    throw invalido(
      `${campo} deve ser um inteiro${max !== undefined ? ` entre ${min} e ${max}` : ` maior ou igual a ${min}`}.`,
    )
  }
  return numero
}

export function paginacao(params: Registro): { page: number; pageSize: number } {
  return {
    page: inteiro(params, 'page', { padrao: 1, min: 1 }),
    pageSize: inteiro(params, 'page_size', { padrao: 20, min: 1, max: 100 }),
  }
}

export function paginacaoCandidatos(params: Registro): { page: number; pageSize: number } {
  return {
    page: inteiro(params, 'page', { padrao: 1, min: 1 }),
    pageSize: inteiro(params, 'page_size', { padrao: 50, min: 1, max: 200 }),
  }
}

export function booleano(params: Registro, campo: string, padrao = false): boolean {
  const valor = params[campo]
  if (valor === undefined || valor === null || valor === '') return padrao
  if (valor === true || valor === 'true') return true
  if (valor === false || valor === 'false') return false
  throw invalido(`${campo} deve ser true ou false.`)
}

export function periodo(params: Registro, campo: string, obrigatorio: boolean): string | undefined {
  const valor = texto(params, campo)
  if (valor === undefined) {
    if (obrigatorio) throw invalido(`${campo} é obrigatório.`)
    return undefined
  }
  if (!periodoValido(valor)) {
    throw invalido(
      `${campo} deve ser YYYY-MM ou YYYY-MM/YYYY-MM, com início menor ou igual ao fim.`,
    )
  }
  return valor
}

/** Os dois períodos precisam ser diferentes e ter a mesma duração. */
export function compararPeriodos(atual: string | undefined, comparacao: string | undefined) {
  if (atual === undefined || comparacao === undefined) return
  if (atual === comparacao) throw invalido('Os períodos devem ser diferentes.')
  if (duracaoEmMeses(atual) !== duracaoEmMeses(comparacao)) {
    throw invalido('Os períodos devem ter a mesma duração.')
  }
}

/** `bairro` exige `municipio`. */
export function regiao(params: Registro) {
  const municipio = texto(params, 'municipio')
  const bairro = texto(params, 'bairro')
  if (bairro && !municipio) throw invalido('bairro exige municipio.')
  return {
    municipio,
    bairro,
    classe: texto(params, 'classe'),
    alimentador: texto(params, 'alimentador'),
  }
}
