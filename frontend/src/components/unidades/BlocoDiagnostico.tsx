import { ReceiptText, TriangleAlert } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { Indicador } from '@/types/comum'
import type { ConsumoMes, DiagnosticoConta } from '@/types/unidades'
import { formatarIndicador, formatarPercentual } from '@/utils/formatacao'
import { formatarMes, formatarPeriodo } from '@/utils/periodos'
import { mesesEstimados } from './consumo'

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

/**
 * "Saiba mais" do alerta de leitura estimada: explicação geral, sem causa específica (a Gold não
 * informa o motivo de cada estimativa), e os meses estimados do período com a leitura seguinte.
 */
function SaibaMaisEstimada({ consumo }: { consumo: readonly ConsumoMes[] }) {
  const estimados = mesesEstimados(consumo)
  return (
    <details className="mt-2 text-corpo text-ink">
      <summary className="cursor-pointer text-alerta-escuro underline underline-offset-2">
        Saiba mais
      </summary>
      <div className="mt-2 rounded-md bg-surface-card p-3">
        <p className="text-legenda font-medium text-ink-2">Explicação geral</p>
        <p className="mt-1">
          Leitura estimada é quando o consumo do mês é faturado por uma estimativa feita com base no
          histórico de consumo da unidade, em vez da leitura do medidor. Na próxima leitura real, o
          medidor registra o consumo acumulado, e a diferença entre o estimado e o real costuma ser
          acertada na fatura seguinte, para mais ou para menos.
        </p>
        <p className="mt-1 text-ink-2">A base de dados não informa o motivo de cada estimativa.</p>

        <p className="mt-3 text-legenda font-medium text-ink-2">
          Meses com leitura estimada no período
        </p>
        {estimados.length > 0 ? (
          <ul className="mt-1 list-disc pl-5">
            {estimados.map((e) => (
              <li key={e.mes}>
                <strong className="font-medium">{formatarMes(e.mes)}</strong>: {e.seguinte}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">
            Nenhum mês do período foi estimado; a estimativa foi no mesmo mês do ano anterior.
          </p>
        )}
      </div>
    </details>
  )
}

/** Bloco 3: diagnóstico "a conta veio alta?" do mês analisado, com os números que o sustentam. */
export default function BlocoDiagnostico({
  diagnostico: d,
  consumo,
}: {
  diagnostico: DiagnosticoConta
  consumo: readonly ConsumoMes[]
}) {
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
  // O selo é só do mês analisado. `leitura_estimada` da API também vale para o mesmo mês do ano
  // anterior; esse caso fica no alerta, para não parecer que o mês analisado foi estimado.
  const mesAnalisado = consumo.find((m) => m.mes === d.periodo_referencia)
  const estimadaNoMes = mesAnalisado?.tipo_leitura === 'ESTIMADA'
  return (
    <Card
      titulo={TITULO}
      subtitulo={`Mês analisado: ${formatarMes(d.periodo_referencia)}`}
      aria-label={TITULO}
      acoes={
        <div className="flex flex-wrap justify-end gap-2">
          <SeloContaAlta contaAlta={d.conta_alta} />
          {estimadaNoMes && <Badge variante="alerta">Leitura estimada</Badge>}
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
        <div className="mt-4 rounded-md bg-alerta-suave p-3">
          <p className="flex items-start gap-2 text-corpo text-alerta-escuro">
            <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{d.alerta}</span>
          </p>
          {d.leitura_estimada && <SaibaMaisEstimada consumo={consumo} />}
        </div>
      )}
    </Card>
  )
}
