/** Estado exclusivo da prévia visual. Não é contrato de /auth nem sessão real. */
export const ETAPAS = ['login', 'cadastro', 'confirmacao', 'sessao', 'expirada'] as const
export type EtapaAuth = (typeof ETAPAS)[number]
export type CenarioEnvio = 'normal' | 'invalido' | 'indisponivel'

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
