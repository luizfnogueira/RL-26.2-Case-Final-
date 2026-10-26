import { ChevronRight } from 'lucide-react'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Tabela, { type Coluna } from '@/components/ui/Tabela'
import type { DrillDown, ItemBreadcrumb, LinhaDrill, NivelDrill } from '@/types/dashboard'
import { cx } from '@/utils/cx'
import {
  formatarEnergia,
  formatarPercentual,
  formatarReais,
  formatarReaisCompleto,
} from '@/utils/formatacao'

const ROTULO_NIVEL: Record<NivelDrill, string> = {
  municipio: 'Município',
  bairro: 'Bairro',
  classe: 'Classe',
}

type Props = {
  drill: DrillDown
  carregando?: boolean
  /** Desce um nível: a tela reenvia os filtros da linha. Ausente no último nível (classe). */
  aoSelecionar: (linha: LinhaDrill) => void
  /** Volta pelo breadcrumb: a tela remove os filtros descendentes. */
  aoNavegar: (item: ItemBreadcrumb) => void
  aoMudarPagina: (page: number) => void
}

/** Cor do número pelo sinal; o sinal escrito (+/−) garante que a cor não é a única pista. */
function Efeito({ valor, formatar }: { valor: number | null; formatar: (v: number) => string }) {
  if (valor === null) return <span className="text-ink-3">—</span>
  return (
    <span
      className={cx(
        'whitespace-nowrap tabular-nums',
        valor > 0 && 'text-sucesso-texto',
        valor < 0 && 'text-perigo-escuro',
      )}
    >
      {formatar(valor)}
    </span>
  )
}

export default function DrillDownReceita({
  drill,
  carregando,
  aoSelecionar,
  aoNavegar,
  aoMudarPagina,
}: Props) {
  const podeDescer = drill.nivel !== 'classe'

  const colunas: Coluna<LinhaDrill>[] = [
    {
      id: 'nome',
      cabecalho: ROTULO_NIVEL[drill.nivel],
      celula: (l) => <strong className="font-medium">{l.nome}</strong>,
    },
    {
      id: 'variacao',
      cabecalho: 'Variação do volume',
      alinhar: 'direita',
      celula: (l) => (
        <Efeito
          valor={l.variacao_energia_percentual.valor}
          formatar={(v) => formatarPercentual(v, { sinal: true })}
        />
      ),
    },
    {
      id: 'preco',
      cabecalho: 'Efeito-preço',
      alinhar: 'direita',
      celula: (l) => (
        <Efeito valor={l.efeito_preco.valor} formatar={(v) => formatarReais(v, { sinal: true })} />
      ),
    },
    {
      id: 'volume',
      cabecalho: 'Efeito-volume',
      alinhar: 'direita',
      celula: (l) => (
        <Efeito valor={l.efeito_volume.valor} formatar={(v) => formatarReais(v, { sinal: true })} />
      ),
    },
    {
      id: 'energia',
      cabecalho: 'Volume',
      alinhar: 'direita',
      // queda_kwh é positivo quando o consumo caiu; na tela mostramos a variação com sinal.
      celula: (l) => (
        <Efeito
          valor={l.queda_kwh.valor === null ? null : -l.queda_kwh.valor}
          formatar={(v) => formatarEnergia(v, { sinal: true })}
        />
      ),
    },
    {
      id: 'receita',
      cabecalho: 'Receita de energia',
      alinhar: 'direita',
      celula: (l) => (
        <span
          className="whitespace-nowrap tabular-nums"
          title={formatarReaisCompleto(l.receita_energia_atual.valor ?? 0)}
        >
          {l.receita_energia_atual.valor === null
            ? '—'
            : formatarReais(l.receita_energia_atual.valor)}
        </span>
      ),
    },
  ]
  if (podeDescer) {
    colunas.push({
      id: 'abrir',
      cabecalho: '',
      alinhar: 'direita',
      largura: '2.5rem',
      celula: () => <ChevronRight size={18} aria-hidden="true" className="text-ink-2" />,
    })
  }

  return (
    <Card
      titulo="Onde o volume caiu?"
      acoes={<p className="text-legenda text-ink-2">Ordenado por maior queda de volume</p>}
      className={carregando ? 'opacity-70 transition-opacity' : 'transition-opacity'}
    >
      <nav aria-label="Caminho do drill-down" className="-mt-2 mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-corpo">
          {drill.breadcrumb.map((item, i) => {
            const ultimo = i === drill.breadcrumb.length - 1
            return (
              <li key={`${item.nivel}-${item.rotulo}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={14} aria-hidden="true" className="text-ink-3" />}
                {ultimo ? (
                  <span aria-current="page" className="font-medium text-teal-profundo">
                    {item.rotulo}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => aoNavegar(item)}
                    className="rounded-sm text-ink-2 hover:text-teal-profundo hover:underline"
                  >
                    {item.rotulo}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <Tabela
        legenda={`Variação de volume e efeitos por ${ROTULO_NIVEL[drill.nivel].toLowerCase()}`}
        colunas={colunas}
        linhas={drill.items}
        chaveLinha={(l) => l.nome}
        aoClicarLinha={podeDescer ? aoSelecionar : undefined}
        carregando={carregando}
        paginacao={{
          page: drill.page,
          pageSize: drill.page_size,
          total: drill.total,
          aoMudar: aoMudarPagina,
        }}
        vazio={
          <EmptyState
            titulo="Sem recortes neste nível"
            descricao="Nenhum recorte tem dados para os filtros escolhidos."
          />
        }
      />
    </Card>
  )
}
