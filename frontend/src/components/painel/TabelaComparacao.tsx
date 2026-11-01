import { ArrowDownRight, ArrowUpRight, CircleHelp, Minus, TriangleAlert } from 'lucide-react'
import Card from '@/components/ui/Card'
import Tabela, { type Coluna } from '@/components/ui/Tabela'
import type { Comparacao, ItemComparacao } from '@/types/dashboard'
import { formatarNome, formatarReaisCompleto } from '@/utils/formatacao'
import {
  INDICADORES_COMPARACAO,
  motivoAusencia,
  pioresDaLinha,
  type CampoComparacao,
} from './comparacao'

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const comSinal = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 4,
  signDisplay: 'exceptZero',
})

function Ausente({ motivo, contexto }: { motivo: string; contexto: string }) {
  return (
    <details className="inline-block align-top font-normal">
      <summary
        title={motivo}
        aria-label={`Por que ${contexto} está ausente?`}
        className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-ink-2 [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true">—</span>
        <CircleHelp size={14} aria-hidden="true" />
      </summary>
      <p className="mt-1 max-w-64 text-legenda text-ink-2">{motivo}</p>
    </details>
  )
}

function valor(v: number, campo: CampoComparacao, diferenca = false): string {
  if (diferenca && campo === 'valor_em_aberto_pct') return `${comSinal.format(v)} p.p.`
  const texto =
    campo === 'receita_media_uc'
      ? formatarReaisCompleto(v)
      : campo === 'ucs_ativas'
        ? inteiro.format(v)
        : `${numero.format(v)}${campo === 'valor_em_aberto_pct' ? '%' : ''}`
  return diferenca && v > 0 ? `+${texto}` : texto
}

type Linha = (typeof INDICADORES_COMPARACAO)[number]

function Celula({
  item,
  campo,
  nivel,
  pior,
  empate,
}: {
  item: ItemComparacao
  campo: CampoComparacao
  nivel: Comparacao['filtros']['nivel']
  pior: boolean
  empate: boolean
}) {
  const kpi = item[campo]
  const contexto = `${INDICADORES_COMPARACAO.find((r) => r.campo === campo)!.titulo} de ${formatarNome(item.nome)}`
  const variacao = kpi.variacao_percentual.valor
  const Seta =
    variacao === null || variacao === 0 ? Minus : variacao < 0 ? ArrowDownRight : ArrowUpRight
  return (
    <div className="min-w-44 space-y-2 text-corpo">
      <div>
        <span className="block text-legenda text-ink-2">Atual</span>
        <div className="font-medium tabular-nums">
          {kpi.atual.valor === null ? (
            <Ausente
              motivo={motivoAusencia(item, campo, kpi, 'atual', nivel)}
              contexto={`o valor atual de ${contexto}`}
            />
          ) : (
            valor(kpi.atual.valor, campo)
          )}
        </div>
      </div>
      <div className="text-legenda text-ink-2">
        Comparação:{' '}
        {kpi.comparacao.valor === null ? (
          <Ausente
            motivo={motivoAusencia(item, campo, kpi, 'comparacao', nivel)}
            contexto={`o valor de comparação de ${contexto}`}
          />
        ) : (
          valor(kpi.comparacao.valor, campo)
        )}
      </div>
      <div className="text-legenda text-ink">
        Diferença:{' '}
        {kpi.diferenca.valor === null ? (
          <Ausente
            motivo={
              campo === 'valor_em_aberto_pct'
                ? 'Falta um dos percentuais na fonte para calcular a diferença em pontos percentuais.'
                : motivoAusencia(item, campo, kpi, 'diferenca', nivel)
            }
            contexto={`a diferença de ${contexto}`}
          />
        ) : (
          valor(kpi.diferenca.valor, campo, true)
        )}
      </div>
      <div className="flex items-center gap-1 text-legenda text-ink-2">
        <Seta size={14} aria-hidden="true" />
        <div>
          {campo === 'valor_em_aberto_pct' ? 'Variação relativa: ' : 'Variação: '}
          {variacao === null ? (
            <Ausente
              motivo={motivoAusencia(item, campo, kpi, 'variacao_percentual', nivel)}
              contexto={`a variação de ${contexto}`}
            />
          ) : (
            `${comSinal.format(variacao)}%`
          )}
        </div>
      </div>
      {pior && (
        <p className="inline-flex items-center gap-1 rounded-full bg-alerta-suave px-2 py-1 text-legenda text-alerta-escuro">
          <TriangleAlert size={14} aria-hidden="true" />
          {empate ? 'Pior valor (empate)' : 'Pior valor'}
        </p>
      )}
    </div>
  )
}

export default function TabelaComparacao({ dados }: { dados: Comparacao }) {
  const piores = new Map(
    INDICADORES_COMPARACAO.map((r) => [r.campo, pioresDaLinha(dados.itens, r.campo)]),
  )
  const colunas: Coluna<Linha>[] = [
    {
      id: 'indicador',
      cabecalho: 'Indicador',
      largura: '15rem',
      celula: (r) => (
        <div className="min-w-40">
          <h3 className="font-medium">{r.titulo}</h3>
          <p className="text-legenda text-ink-2">{r.unidade}</p>
          <p className="mt-2 text-legenda text-ink-2">{r.criterio}</p>
        </div>
      ),
    },
    ...dados.itens.map((item) => ({
      id: item.nome,
      cabecalho: formatarNome(item.nome),
      alinhar: 'esquerda' as const,
      celula: (r: Linha) => (
        <Celula
          item={item}
          campo={r.campo}
          nivel={dados.filtros.nivel}
          pior={piores.get(r.campo)!.includes(item.nome)}
          empate={piores.get(r.campo)!.length > 1}
        />
      ),
    })),
  ]
  return (
    <Card
      titulo="Indicadores lado a lado"
      subtitulo="Valores, diferenças e variações fornecidos pela API para os mesmos períodos."
    >
      <Tabela
        legenda="Comparação dos seis indicadores por recorte"
        linhas={INDICADORES_COMPARACAO}
        colunas={colunas}
        chaveLinha={(r) => r.campo}
      />
      <p className="mt-5 text-legenda leading-5 text-ink-2">
        A diferença mostra quanto o valor mudou, na unidade de cada indicador. Para entender um
        valor ausente (—), abra o ícone de ajuda ao lado dele.
      </p>
      <p className="mt-2 text-legenda leading-5 text-ink-2">
        Receita e consumo são médias por UC e por mês, com as UCs ativas no fim de cada janela como
        denominador. A receita inclui tributos. UCs ativas mostram o tamanho do recorte e não
        recebem destaque de pior valor.
      </p>
      <p className="mt-2 text-legenda leading-5 text-ink-2">
        O destaque compara o valor atual, exceto no consumo, em que considera a maior queda
        percentual. Empates são identificados; com menos de dois valores disponíveis não há
        classificação. Variação relativa (%) e diferença entre percentuais (p.p.) são medidas
        diferentes.
      </p>
      {dados.filtros.nivel !== 'municipio' && (
        <p className="mt-2 text-legenda leading-5 text-ink-2">
          DEC e FEC ficam ausentes em bairros e classes: a continuidade é medida por alimentador e
          município.
        </p>
      )}
    </Card>
  )
}
