import { ReceiptText, TriangleAlert } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { Indicador } from '@/types/comum'
import type { DiagnosticoConta } from '@/types/unidades'
import { formatarIndicador, formatarPercentual } from '@/utils/formatacao'
import { formatarMes, formatarPeriodo } from '@/utils/periodos'

const TITULO = 'A conta veio alta?'

/**
 * Resposta curta pela flag da Gold; null é "sem base", não "normal". O selo mede consumo, não o
 * valor da conta: quem reclama de conta alta em geral não consumiu mais.
 */
function SeloContaAlta({ contaAlta }: { contaAlta: boolean | null }) {
  if (contaAlta === null) return <Badge variante="neutro">Sem comparação com o ano anterior</Badge>
  return contaAlta ? (
    <Badge variante="perigo">Consumo subiu</Badge>
  ) : (
    <Badge variante="sucesso">Sem alta de consumo</Badge>
  )
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe: string }) {
  return (
    <div className="min-w-0 rounded-md bg-surface-alt p-3">
      <dt className="text-legenda text-ink-2">{rotulo}</dt>
      <dd className="text-titulo-lg font-light tabular-nums">{valor}</dd>
      <dd className="text-legenda text-ink-2">{detalhe}</dd>
    </div>
  )
}

const variacao = (indicador: Indicador) =>
  indicador.valor === null ? '—' : formatarPercentual(indicador.valor, { sinal: true })

/** Bloco 3: diagnóstico "a conta veio alta?" do mês analisado, com os números que o sustentam. */
export default function BlocoDiagnostico({ diagnostico: d }: { diagnostico: DiagnosticoConta }) {
  if (d.veredito === null || d.periodo_referencia === null) {
    return (
      <Card titulo={TITULO} aria-label={TITULO}>
        <EmptyState
          icone={<ReceiptText size={26} strokeWidth={1.5} />}
          titulo="Sem consumo nesta janela"
          descricao="A unidade não tem consumo registrado no período analisado, então não há diagnóstico."
        />
      </Card>
    )
  }
  return (
    <Card
      titulo={TITULO}
      subtitulo={`Mês analisado: ${formatarMes(d.periodo_referencia)}`}
      aria-label={TITULO}
      acoes={
        <div className="flex flex-wrap justify-end gap-2">
          <SeloContaAlta contaAlta={d.conta_alta} />
          {d.leitura_estimada && <Badge variante="alerta">Leitura estimada</Badge>}
        </div>
      }
    >
      <p className="text-titulo">{d.veredito}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero
          rotulo="Último mês"
          valor={formatarIndicador(d.ultimo_mes)}
          detalhe={formatarMes(d.ultimo_mes.periodo_referencia)}
        />
        <Numero
          rotulo="Mesmo mês do ano anterior"
          valor={formatarIndicador(d.mesmo_mes_ano_anterior)}
          detalhe={formatarMes(d.mesmo_mes_ano_anterior.periodo_referencia)}
        />
        <Numero
          rotulo="Média dos meses anteriores"
          valor={formatarIndicador(d.media_12_meses)}
          detalhe={`${d.meses_media} de 12 meses · ${formatarPeriodo(d.media_12_meses.periodo_referencia)}`}
        />
        <Numero
          rotulo="Variação sobre o ano anterior"
          valor={variacao(d.variacao_percentual)}
          detalhe={formatarMes(d.variacao_percentual.periodo_referencia)}
        />
      </dl>

      {d.alerta && (
        // O alerta não muda o veredito: diz quanto confiar nele.
        <p className="mt-4 flex items-start gap-2 rounded-md bg-alerta-suave p-3 text-corpo text-alerta-escuro">
          <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{d.alerta}</span>
        </p>
      )}
    </Card>
  )
}
