import type { Candidato } from '@/types/inspecoes'

const CABECALHO = [
  'Posição',
  'UC',
  'Município',
  'Bairro',
  'Classe',
  'Alimentador',
  'Motivos',
  'Energia estimada (kWh)',
  'Score (pontos)',
  'Confiança da evidência',
  'Ordem ativa',
  'ID da ordem ativa',
  'Período de referência',
]

function celulaCsv(valor: string | number): string {
  const texto = String(valor)
  const seguro = typeof valor === 'string' && /^\s*[=+\-@]/.test(texto) ? `'${texto}` : texto
  return `"${seguro.replaceAll('"', '""')}"`
}

export function gerarCsvCandidatos(candidatos: readonly Candidato[]): string {
  const linhas = candidatos.map((candidato) => [
    candidato.posicao,
    candidato.id_uc,
    candidato.municipio,
    candidato.bairro,
    candidato.classe,
    candidato.alimentador,
    candidato.motivos.join(' | '),
    candidato.energia_estimada.valor ?? '',
    `${candidato.score.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pts`,
    candidato.confianca_evidencia,
    candidato.ordem_ativa ? 'Sim' : 'Não',
    candidato.id_ordem_ativa ?? '',
    candidato.energia_estimada.periodo_referencia,
  ])

  return `\uFEFF${[CABECALHO, ...linhas].map((linha) => linha.map(celulaCsv).join(',')).join('\r\n')}\r\n`
}
