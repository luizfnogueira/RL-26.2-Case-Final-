import type { PontoComparado } from '@/components/graficos/BarrasComparadas'
import type { ConsumoMes, TipoLeitura } from '@/types/unidades'
import { formatarNome } from '@/utils/formatacao'
import { formatarMes } from '@/utils/periodos'

/** Leitura do medidor de fato; MEDIA e NAO REALIZADA não contam como leitura real. */
const LEITURAS_REAIS: readonly TipoLeitura[] = ['REAL', 'AUTENTICADA']

export interface MesEstimado {
  mes: string
  /** O que aconteceu na leitura do mês seguinte, já em texto para a tela. */
  seguinte: string
}

/**
 * Meses do período com leitura estimada (o mais recente primeiro) e a situação da leitura do mês
 * seguinte. Só consulta a linha vizinha do `consumo` da API; o último mês do período não tem
 * mês seguinte na resposta.
 */
export function mesesEstimados(consumo: readonly ConsumoMes[]): MesEstimado[] {
  return consumo
    .flatMap((m, i) => {
      if (m.tipo_leitura !== 'ESTIMADA') return []
      const proximo = consumo[i + 1]
      if (!proximo) return [{ mes: m.mes, seguinte: 'ainda sem leitura posterior no período' }]
      const rotulo = formatarMes(proximo.mes)
      const tipo = proximo.tipo_leitura
      const seguinte =
        tipo === null
          ? `sem dado no mês seguinte (${rotulo})`
          : LEITURAS_REAIS.includes(tipo)
            ? `a leitura seguinte (${rotulo}) foi real`
            : tipo === 'ESTIMADA'
              ? `a leitura seguinte (${rotulo}) também foi estimada`
              : `a leitura seguinte (${rotulo}) não foi real (${formatarNome(tipo)})`
      return [{ mes: m.mes, seguinte }]
    })
    .reverse()
}

/**
 * Meses do contrato → pontos do gráfico de 12 meses. Ausente continua null (lacuna, nunca zero);
 * o ano aparece no primeiro mês e em janeiro; leitura estimada vira o aviso de texto "estimada".
 */
export function pontosDoConsumo(consumo: readonly ConsumoMes[]): PontoComparado[] {
  return consumo.map((m, i) => {
    const [mes, ano] = formatarMes(m.mes).split('/')
    return {
      id: m.mes,
      rotulo: mes,
      rotuloSecundario: i === 0 || m.mes.endsWith('-01') ? ano : undefined,
      rotuloCompleto: formatarMes(m.mes),
      atual: m.atual.valor,
      anterior: m.ano_anterior.valor,
      aviso: m.tipo_leitura === 'ESTIMADA' ? 'estimada' : null,
    }
  })
}
