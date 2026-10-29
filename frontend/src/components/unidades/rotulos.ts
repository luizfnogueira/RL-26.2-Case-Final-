import type { VarianteBadge } from '@/components/ui/Badge'

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

export interface EstiloBandeira {
  variante: VarianteBadge
  /** Classes extras do selo, só onde a variante do Badge não tem o tom certo. */
  className?: string
}

/**
 * Selo de cada bandeira tarifária da Gold, com as variantes do Badge e os tokens do @theme. A P2
 * é a mais cara: vermelho forte (perigo-escuro com texto branco, contraste 7,7:1). O `!` garante
 * que essas classes vençam as da variante, independentemente da ordem do CSS gerado.
 */
const BANDEIRAS: Record<string, EstiloBandeira> = {
  VERDE: { variante: 'sucesso' },
  AMARELA: { variante: 'alerta' },
  'VERMELHA P1': { variante: 'perigo' },
  'VERMELHA P2': { variante: 'perigo', className: 'bg-perigo-escuro! text-ink-inverso!' },
}

/** Estilo do selo da bandeira; valor desconhecido vira selo neutro, com o texto como veio. */
export function estiloBandeira(bandeira: string): EstiloBandeira {
  return Object.hasOwn(BANDEIRAS, bandeira) ? BANDEIRAS[bandeira] : { variante: 'neutro' }
}
