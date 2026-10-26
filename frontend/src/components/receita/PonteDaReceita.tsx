import { Info } from 'lucide-react'
import Cascata from '@/components/graficos/Cascata'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { Dashboard } from '@/types/dashboard'
import { formatarPercentual, formatarReais, formatarReaisCompleto } from '@/utils/formatacao'
import { etapasDaPonte, variacaoDaReceita } from './explicacao'

type Props = {
  dashboard: Dashboard
  /** Atualizando com filtros novos: mantém o gráfico anterior, esmaecido. */
  atualizando?: boolean
}

export default function PonteDaReceita({ dashboard, atualizando }: Props) {
  const etapas = etapasDaPonte(dashboard)
  const variacao = variacaoDaReceita(dashboard)
  const motivo = dashboard.metadados.observacoes.at(-1)

  return (
    <Card
      titulo="Ponte da receita"
      subtitulo="Contribuição de cada efeito na variação da receita de energia"
      acoes={
        variacao !== null && (
          <Badge variante={variacao >= 0 ? 'sucesso' : 'perigo'}>
            {formatarPercentual(variacao, { sinal: true })} total
          </Badge>
        )
      }
      className={atualizando ? 'opacity-70 transition-opacity' : 'transition-opacity'}
    >
      {etapas ? (
        <Cascata
          etapas={etapas}
          formatarValor={(valor, etapa) =>
            formatarReais(valor, { sinal: etapa?.tipo === 'variacao' })
          }
          formatarEixo={(valor) => formatarReais(valor).replace('R$ ', '')}
          formatarValorCompleto={formatarReaisCompleto}
          descricao="Receita de energia: da base ao valor atual, com efeito-preço e efeito-volume"
        />
      ) : (
        <EmptyState
          titulo="Decomposição indisponível para este recorte"
          descricao={
            motivo ??
            'A Gold só decompõe a receita entre as janelas padrão e sem filtro de alimentador.'
          }
        />
      )}
      <p className="mt-3 flex items-start gap-1.5 text-legenda text-ink-2">
        <Info size={14} aria-hidden="true" className="mt-px shrink-0" />
        Receita de energia, sem tributos. Por isso difere da receita faturada do painel executivo,
        que inclui tributos.
      </p>
    </Card>
  )
}
