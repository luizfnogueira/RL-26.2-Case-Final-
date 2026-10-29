/**
 * Modalidades de geração distribuída como estão na Gold (as 3 existentes em out/2026) e o rótulo
 * da tela. `formatarNome` não serve aqui: perderia os acentos e transformaria "UC" em "Uc".
 */
const MODALIDADES_GD: Record<string, string> = {
  'GERACAO NA PROPRIA UC': 'Geração na própria UC',
  'AUTOCONSUMO REMOTO': 'Autoconsumo remoto',
  'GERACAO COMPARTILHADA': 'Geração compartilhada',
}

/** Rótulo da modalidade; valor fora do mapa aparece como veio da Gold, sem esconder o dado. */
export function rotuloModalidadeGd(modalidade: string): string {
  return Object.hasOwn(MODALIDADES_GD, modalidade) ? MODALIDADES_GD[modalidade] : modalidade
}
