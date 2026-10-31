import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Tabela, { type Coluna } from '@/components/ui/Tabela'
import { construirUrlComparacao } from '@/hooks/useComparacaoUrl'
import type { DrillDown, ItemBreadcrumb, LinhaDrill, NivelDrill } from '@/types/dashboard'
import { cx } from '@/utils/cx'
import {
  formatarEnergia,
  formatarNome,
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
  /** Por que a lista veio vazia (a API explica em `metadados.observacoes` fora de P1 × P2). */
  motivoVazio?: string
  periodoAtual?: string
  periodoComparacao?: string
  aoComparar?: (itens: string[]) => void
  /** Ranking por região (município ou bairro) ou por classe; com `aoMudarVisao`, a tela mostra o seletor. */
  visao?: Visao
  aoMudarVisao?: (visao: Visao) => void
  /** Se a linha leva a outro recorte. Padrão: todo nível menos classe. */
  podeDescer?: boolean
}

export type Visao = 'regiao' | 'classe'

/** Quantas das maiores perdas por volume aparecem em barras acima da tabela. */
const MAIORES_PERDAS = 5

/** As maiores perdas de receita por volume do ranking (já ordenado pelo efeito-volume), em barras. */
function MaioresPerdas({ linhas }: { linhas: LinhaDrill[] }) {
  const perdas = linhas.filter((l) => (l.efeito_volume.valor ?? 0) < 0).slice(0, MAIORES_PERDAS)
  if (perdas.length === 0) return null
  const maior = Math.abs(perdas[0].efeito_volume.valor as number)
  return (
    <section aria-labelledby="maiores-perdas" className="mb-5">
      <h3 id="maiores-perdas" className="mb-2 text-legenda text-ink-2">
        Maiores perdas de receita por volume
      </h3>
      <ul className="flex flex-col gap-2">
        {perdas.map((l) => {
          const valor = l.efeito_volume.valor as number
          return (
            <li
              key={l.nome}
              className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-corpo"
            >
              <span className="truncate text-ink" title={formatarNome(l.nome)}>
                {formatarNome(l.nome)}
              </span>
              <span className="h-2 rounded-full bg-surface-alt" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-perigo-escuro/70"
                  style={{ width: `${(Math.abs(valor) / maior) * 100}%` }}
                />
              </span>
              <span className="whitespace-nowrap text-perigo-escuro tabular-nums">
                {formatarReais(valor, { sinal: true })}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
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
  motivoVazio,
  periodoAtual,
  periodoComparacao,
  aoComparar,
  visao = 'regiao',
  aoMudarVisao,
  podeDescer = drill.nivel !== 'classe',
}: Props) {
  const navigate = useNavigate()

  // Leva os itens visíveis (de 2 a 4) para a aba de comparação
  const itensVisiveis = drill.items.slice(0, 4).map((l) => l.nome)
  const podeComparar = itensVisiveis.length >= 2 && !carregando

  const municipioPai =
    drill.items[0]?.filtros.municipio ??
    drill.breadcrumb.find((b) => b.filtros.municipio)?.filtros.municipio ??
    undefined
  const bairroPai =
    drill.items[0]?.filtros.bairro ??
    drill.breadcrumb.find((b) => b.filtros.bairro)?.filtros.bairro ??
    undefined

  const urlComparar = construirUrlComparacao({
    aba: 'comparar',
    periodo_atual: periodoAtual,
    periodo_comparacao: periodoComparacao,
    nivel: drill.nivel,
    itens: itensVisiveis,
    municipio: municipioPai,
    bairro: bairroPai,
  })

  function lidarComComparar() {
    if (!podeComparar) return
    aoComparar?.(itensVisiveis)
    navigate(urlComparar)
  }

  const colunas: Coluna<LinhaDrill>[] = [
    {
      id: 'nome',
      cabecalho: ROTULO_NIVEL[drill.nivel],
      celula: (l) => <strong className="font-medium">{formatarNome(l.nome)}</strong>,
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
      acoes={
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-legenda text-ink-2">Ordenado pela perda de receita por volume</p>
          {aoMudarVisao && (
            <div
              role="group"
              aria-label="Ver por"
              className="flex gap-1 rounded-full bg-surface-alt p-1"
            >
              {(
                [
                  ['regiao', 'Região'],
                  ['classe', 'Classes'],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={visao === valor}
                  onClick={() => aoMudarVisao(valor)}
                  className={cx(
                    'cursor-pointer rounded-full px-3 py-1 text-legenda transition-colors',
                    visao === valor
                      ? 'bg-surface-card font-medium text-teal-profundo shadow-sm'
                      : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          )}
          <Button
            variante="secundario"
            tamanho="sm"
            disabled={!podeComparar}
            onClick={lidarComComparar}
            title={
              itensVisiveis.length < 2
                ? 'Necessário ao menos 2 itens visíveis para comparar'
                : `Comparar ${itensVisiveis.length} itens visíveis`
            }
          >
            Comparar
          </Button>
        </div>
      }
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
                    {formatarNome(item.rotulo)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => aoNavegar(item)}
                    className="rounded-sm text-ink-2 hover:text-teal-profundo hover:underline"
                  >
                    {formatarNome(item.rotulo)}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {drill.page === 1 && <MaioresPerdas linhas={drill.items} />}

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
            descricao={motivoVazio ?? 'Nenhum recorte tem dados para os filtros escolhidos.'}
          />
        }
      />
    </Card>
  )
}
