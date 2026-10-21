// DADO FICTÍCIO: usuário logado de exemplo. O login por perfil é um diferencial do case.
export const USUARIO_MOCK = {
  nome: 'Patrícia Lins',
  cargo: 'Diretoria de TI',
  iniciais: 'PL',
} as const

// DADO FICTÍCIO: última carga da Gold hoje às 06:15, até a API informar o valor real.
export function gerarAtualizacaoMock(): Date {
  const data = new Date()
  data.setHours(6, 15, 0, 0)
  return data
}
