/** Estado exclusivo da prévia visual. Não é contrato de /auth nem sessão real. */
export const ETAPAS = ['login', 'cadastro', 'confirmacao', 'sessao', 'expirada'] as const
export type EtapaAuth = (typeof ETAPAS)[number]
export type CenarioEnvio = 'normal' | 'invalido' | 'indisponivel'
export type PessoaExemplo = { nome: string; email: string }

export const EXEMPLO = { nome: 'Artur', email: 'artur@venergy.test' }
export const SENHA_EXEMPLO = 'EnergiaDemo2026!'
export const CONVITE_EXEMPLO = 'VENERGY-DEMO'

export function etapaValida(etapa: string | undefined): etapa is EtapaAuth {
  return ETAPAS.some((valor) => valor === etapa)
}

export function mensagemDoCenario(cenario: CenarioEnvio): string | null {
  if (cenario === 'invalido')
    return 'E-mail ou senha inválidos. Confira os dados e tente novamente.'
  if (cenario === 'indisponivel')
    return 'Não foi possível conectar agora. Tente novamente em instantes.'
  return null
}

const ORIGEM_PORTAL = 'https://portal.venergy.invalid'
const DESTINOS = {
  '/painel': 'Painel Executivo',
  '/receita': 'Diagnóstico da receita',
  '/unidades': 'Visão 360',
  '/perdas/fila': 'Fila de inspeção',
  '/perdas/ordens': 'Ordens de inspeção',
  '/operacao': 'Operação',
  '/assistente': 'Assistente',
}

/** Retorno apenas para rotas existentes do portal, mantendo o recorte da URL. */
export function destinoSeguro(valor: string | null): string {
  if (
    !valor?.startsWith('/') ||
    valor.startsWith('//') ||
    [...valor].some((c) => c === '\\' || c.charCodeAt(0) <= 32)
  )
    return '/painel'
  try {
    const url = new URL(valor, ORIGEM_PORTAL)
    if (url.origin !== ORIGEM_PORTAL) return '/painel'
    if (!(url.pathname in DESTINOS) && !/^\/unidades\/[^/]+$/.test(url.pathname)) return '/painel'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/painel'
  }
}

export function nomeDoDestino(destino: string): string {
  const caminho = new URL(destinoSeguro(destino), ORIGEM_PORTAL).pathname
  return DESTINOS[caminho as keyof typeof DESTINOS] ?? 'Visão 360'
}

export function rotaDaPrevia(etapa: EtapaAuth, destino: string): string {
  const seguro = destinoSeguro(destino)
  return `/dev/auth/${etapa}${seguro === '/painel' ? '' : `?${new URLSearchParams({ destino: seguro })}`}`
}
