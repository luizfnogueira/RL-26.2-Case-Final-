import type { Metadados } from '@/types/comum'
import Badge from './Badge'

type Props = { metadados?: Pick<Metadados, 'dados_ficticios'> | null }

/**
 * Selo "DADO FICTÍCIO" para telas alimentadas por mock ou seed (regra do cronograma: nenhum mock
 * sem rótulo). Some sozinho quando `metadados.dados_ficticios` é false, ou seja, com a Gold real.
 */
export default function SeloFicticio({ metadados }: Props) {
  if (!metadados?.dados_ficticios) return null
  return (
    <Badge variante="alerta" ponto title="Valores de exemplo, não representam a Gold real">
      Dado fictício
    </Badge>
  )
}
