import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert } from 'lucide-react'
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

function Ausente({ motivo }: { motivo: string }) {
  return (
    <span title={motivo} className="cursor-help">
      —<span className="sr-only"> ({motivo})</span>
    </span>
  )
}

function valor(valor: number, campo: CampoComparacao): string {
  if (campo === 'receita_media_uc') return formatarReaisCompleto(valor)
  if (campo === 'ucs_ativas') return inteiro.format(valor)
  return `${numero.format(valor)}${campo === 'valor_em_aberto_pct' ? '%' : ''}`
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
  const variacao = kpi.variacao_percentual.valor
  const Seta =
    variacao === null || variacao === 0 ? Minus : variacao < 0 ? ArrowDownRight : ArrowUpRight
  return (
    <div className="min-w-44 space-y-2 text-corpo">
      <p>
        <span className="block text-legenda text-ink-2">Atual</span>
        <strong className="font-medium tabular-nums">
          {kpi.atual.valor === null ? (
            <Ausente motivo={motivoAusencia(item, campo, kpi, 'atual', nivel)} />
          ) : (
            valor(kpi.atual.valor, campo)
          )}
        </strong>
      </p>
      <p className="text-legenda text-ink-2">
        Comparação:{' '}
        {kpi.comparacao.valor === null ? (
          <Ausente motivo={motivoAusencia(item, campo, kpi, 'comparacao', nivel)} />
        ) : (
          valor(kpi.comparacao.valor, campo)
        )}
      </p>
      {campo === 'valor_em_aberto_pct' && (
        <p className="text-legenda text-ink">
          Diferença:{' '}
          {kpi.diferenca.valor === null ? (
            <Ausente motivo="Falta um dos percentuais na fonte para calcular a diferença em pontos percentuais." />
          ) : (
            `${comSinal.format(kpi.diferenca.valor)} p.p.`
          )}
        </p>
      )}
      <p className="flex items-center gap-1 text-legenda text-ink-2">
        <Seta size={14} aria-hidden="true" />
        <span>
          {campo === 'valor_em_aberto_pct' ? 'Variação relativa: ' : 'Variação: '}
          {variacao === null ? (
            <Ausente motivo={motivoAusencia(item, campo, kpi, 'variacao_percentual', nivel)} />
          ) : (
            `${comSinal.format(variacao)}%`
          )}
        </span>
      </p>
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
