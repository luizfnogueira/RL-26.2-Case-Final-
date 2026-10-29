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

/** Rótulo do mapa; valor fora dele aparece como veio da Gold, sem esconder o dado. */
function rotuloDoMapa(mapa: Record<string, string>, valor: string): string {
  return Object.hasOwn(mapa, valor) ? mapa[valor] : valor
}

export function rotuloModalidadeGd(modalidade: string): string {
  return rotuloDoMapa(MODALIDADES_GD, modalidade)
}

/** Canais de atendimento da Gold (os 5 existentes em out/2026). */
const CANAIS: Record<string, string> = {
  APP: 'Aplicativo',
  PRESENCIAL: 'Presencial',
  SITE: 'Site',
  TELEFONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
}

/** Assuntos dos chamados da Gold (os 6 existentes em out/2026). */
const ASSUNTOS: Record<string, string> = {
  'DANO ELETRICO': 'Dano elétrico',
  'FALTA DE ENERGIA': 'Falta de energia',
  FATURA: 'Fatura',
  'GERACAO DISTRIBUIDA': 'Geração distribuída',
  'LIGACAO NOVA': 'Ligação nova',
  RELIGACAO: 'Religação',
}

/**
 * Subassuntos da Gold (os 15 existentes em out/2026, nos 17 pares com o assunto). O mapa é único,
 * não por assunto: "VISTORIA" aparece em três assuntos com o mesmo rótulo.
 */
const SUBASSUNTOS: Record<string, string> = {
  RESSARCIMENTO: 'Ressarcimento',
  VISTORIA: 'Vistoria',
  'INTERRUPCAO PARCIAL': 'Interrupção parcial',
  'INTERRUPCAO TOTAL': 'Interrupção total',
  OSCILACAO: 'Oscilação',
  CONTESTACAO: 'Contestação',
  PARCELAMENTO: 'Parcelamento',
  'SEGUNDA VIA': 'Segunda via',
  'VALOR ALTO': 'Valor alto',
  CREDITOS: 'Créditos',
  HOMOLOGACAO: 'Homologação',
  PRAZO: 'Prazo',
  SOLICITACAO: 'Solicitação',
  'APOS PAGAMENTO': 'Após pagamento',
  URGENCIA: 'Urgência',
}

export function rotuloCanal(canal: string): string {
  return rotuloDoMapa(CANAIS, canal)
}

/** "Assunto · Subassunto", cada parte pelo seu mapa. */
export function rotuloAssunto(assunto: string, subassunto: string): string {
  return `${rotuloDoMapa(ASSUNTOS, assunto)} · ${rotuloDoMapa(SUBASSUNTOS, subassunto)}`
}

const horas = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/**
 * Tempo até o fechamento do chamado (na Gold, fechamento − abertura em horas). Acima de 24 h, em
 * dias e horas inteiras ("7 d 20 h"); até 24 h, em horas, sem casa decimal quando for inteiro
 * ("4 h", "4,5 h").
 */
export function formatarTempoAteFechamento(totalHoras: number): string {
  if (totalHoras <= 24) return `${horas.format(totalHoras)} h`
  const inteiras = Math.round(totalHoras)
  const dias = Math.floor(inteiras / 24)
  const resto = inteiras % 24
  return resto === 0 ? `${dias} d` : `${dias} d ${resto} h`
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
