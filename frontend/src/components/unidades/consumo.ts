import type { PontoComparado } from '@/components/graficos/BarrasComparadas'
import type { ConsumoMes } from '@/types/unidades'
import { formatarMes } from '@/utils/periodos'

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
