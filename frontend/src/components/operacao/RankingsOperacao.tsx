import { ArrowUpRight, ChartNoAxesCombined } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Select from '@/components/ui/Select'
import Tabela, { type Coluna } from '@/components/ui/Tabela'
import type { Indicador } from '@/types/comum'
import type {
  NivelRegional,
  Operacao,
  OrdenarPor,
  RankingAlimentador,
  RankingRegional,
} from '@/types/operacao'
import { formatarNome } from '@/utils/formatacao'
import { numeroOperacao } from './formatacao'

export type VisaoRanking = 'alimentadores' | 'regional'
type Metricas = Pick<
  RankingRegional,
  | 'dec'
  | 'fec'
  | 'dec_sem_dia_critico'
  | 'fec_sem_dia_critico'
  | 'interrupcoes'
  | 'horas_interrupcao'
>

function CelulaIndice({ indicador, semCritico }: { indicador: Indicador; semCritico: Indicador }) {
  return (
    <div className="whitespace-nowrap">
      <span
        className="font-medium"
        title={indicador.valor === null ? 'Indicador indisponível na fonte.' : undefined}
      >
        {numeroOperacao(indicador.valor)}
      </span>
      <span
        className="mt-1 block text-legenda text-ink-2"
        title={
          semCritico.valor === null
            ? 'A fonte não disponibiliza o indicador sem dias críticos.'
            : undefined
        }
      >
        Sem críticos: {numeroOperacao(semCritico.valor)}
      </span>
    </div>
  )
}

function colunasMetricas<T extends Metricas>(): Coluna<T>[] {
  return [
    {
      id: 'dec',
      cabecalho: 'DEC (h/UC)',
      alinhar: 'direita',
      celula: (r) => <CelulaIndice indicador={r.dec} semCritico={r.dec_sem_dia_critico} />,
    },
    {
      id: 'fec',
      cabecalho: 'FEC (interrupções/UC)',
      alinhar: 'direita',
      celula: (r) => <CelulaIndice indicador={r.fec} semCritico={r.fec_sem_dia_critico} />,
    },
    {
      id: 'interrupcoes',
      cabecalho: 'Interrupções',
      alinhar: 'direita',
      celula: (r) => numeroOperacao(r.interrupcoes.valor, true),
    },
    {
      id: 'chi',
      cabecalho: 'CHI (h)',
      alinhar: 'direita',
      celula: (r) => numeroOperacao(r.horas_interrupcao.valor),
    },
  ]
}

type Props = {
  dados: Operacao
  visao: VisaoRanking
  ordenarPor: OrdenarPor
  nivel: NivelRegional
  aoMudarVisao: (visao: VisaoRanking) => void
  aoOrdenar: (ordenar: OrdenarPor) => void
  aoMudarNivel: (nivel: NivelRegional) => void
  aoMudarPagina: (pagina: number) => void
  aoSelecionarAlimentador: (alimentador: string) => void
  aoSelecionarRegiao: (regiao: RankingRegional) => void
}

export default function RankingsOperacao({
  dados,
  visao,
  ordenarPor,
  nivel,
  aoMudarVisao,
  aoOrdenar,
  aoMudarNivel,
  aoMudarPagina,
  aoSelecionarAlimentador,
  aoSelecionarRegiao,
}: Props) {
  const pagina = visao === 'alimentadores' ? dados.ranking_alimentadores : dados.ranking_regional
  const colunasAlimentadores: Coluna<RankingAlimentador>[] = [
    {
      id: 'posicao',
      cabecalho: '#',
      celula: (r) => <Badge variante={r.posicao === 1 ? 'info' : 'neutro'}>{r.posicao}</Badge>,
    },
    {
      id: 'alimentador',
      cabecalho: 'Alimentador / município',
      celula: (r) => (
        <div>
          <button
            type="button"
            onClick={() => aoSelecionarAlimentador(r.alimentador)}
            aria-label={`Analisar ${r.alimentador}`}
            className="inline-flex items-center gap-2 rounded-sm font-medium whitespace-nowrap text-teal-profundo hover:underline"
          >
            {r.alimentador}
            <ChartNoAxesCombined size={14} aria-hidden="true" />
          </button>
          <p className="mt-1 text-legenda text-ink-2">{formatarNome(r.municipio)}</p>
        </div>
      ),
    },
    {
      id: 'bairros',
      cabecalho: 'Bairros atendidos',
      celula: (r) =>
        r.bairros_atendidos.length ? (
          <details className="min-w-32 text-legenda">
            <summary className="w-fit cursor-pointer rounded-sm text-teal-profundo">
              {r.bairros_atendidos.length} {r.bairros_atendidos.length === 1 ? 'bairro' : 'bairros'}
            </summary>
            <ul className="mt-2 flex max-w-56 flex-col gap-1 text-ink-2">
              {r.bairros_atendidos.map((b) => (
                <li key={b}>{formatarNome(b)}</li>
              ))}
            </ul>
          </details>
        ) : (
          '—'
        ),
    },
    ...colunasMetricas<RankingAlimentador>(),
    {
      id: 'ucs',
      cabecalho: 'UCs atendidas',
      alinhar: 'direita',
      celula: (r) => (
        <span title="UCs atendidas no último mês disponível da janela">
          {numeroOperacao(r.ucs_atendidas, true)}
        </span>
      ),
    },
  ]
  const colunasRegionais: Coluna<RankingRegional>[] = [
    { id: 'posicao', cabecalho: '#', celula: (r) => <Badge variante="neutro">{r.posicao}</Badge> },
    {
      id: 'regiao',
      cabecalho: nivel === 'municipio' ? 'Município' : 'Bairro / município',
      celula: (r) => (
        <div>
          <button
            type="button"
            onClick={() => aoSelecionarRegiao(r)}
            aria-label={`Ver alimentadores de ${r.bairro ?? r.municipio}`}
            className="inline-flex items-center gap-2 rounded-sm text-left font-medium text-teal-profundo hover:underline"
          >
            {formatarNome(r.bairro ?? r.municipio)}
            <ArrowUpRight size={14} className="shrink-0" aria-hidden="true" />
          </button>
          {r.bairro && <p className="mt-1 text-legenda text-ink-2">{formatarNome(r.municipio)}</p>}
        </div>
      ),
    },
    ...colunasMetricas<RankingRegional>(),
  ]
  const paginacao = pagina.items.length
    ? { page: pagina.page, pageSize: pagina.page_size, total: pagina.total, aoMudar: aoMudarPagina }
    : undefined
  const vazio = (
    <EmptyState
      titulo={pagina.total ? 'Página sem resultados' : 'Nenhum resultado neste ranking'}
      descricao={
        pagina.total
          ? 'Esta página está além do fim da lista. Volte à primeira página.'
          : 'Escolha outro recorte para consultar os indicadores.'
      }
      acao={
        pagina.total ? (
          <Button variante="secundario" onClick={() => aoMudarPagina(1)}>
            Voltar à primeira página
          </Button>
        ) : undefined
      }
    />
  )
  return (
    <Card
      titulo="Rankings de continuidade"
      subtitulo="Maiores valores primeiro. Selecione um alimentador para detalhar o histórico."
    >
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div
          role="group"
          aria-label="Visão do ranking"
          className="flex w-fit gap-1 rounded-full bg-surface-sutil p-1"
        >
          <Button
            tamanho="sm"
            variante={visao === 'alimentadores' ? 'primario' : 'fantasma'}
            aria-pressed={visao === 'alimentadores'}
            onClick={() => aoMudarVisao('alimentadores')}
          >
            Alimentadores
          </Button>
          <Button
            tamanho="sm"
            variante={visao === 'regional' ? 'primario' : 'fantasma'}
            aria-pressed={visao === 'regional'}
            onClick={() => aoMudarVisao('regional')}
          >
            Municípios e bairros
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {visao === 'regional' && (
            <Select
              rotulo="Agrupar região por"
              valor={nivel}
              aoMudar={(v) => aoMudarNivel(v as NivelRegional)}
              opcoes={[
                { valor: 'municipio', rotulo: 'Município' },
                { valor: 'bairro', rotulo: 'Bairro' },
              ]}
            />
          )}
          <Select
            rotulo="Ordenar por"
            valor={ordenarPor}
            aoMudar={(v) => aoOrdenar(v as OrdenarPor)}
            opcoes={[
              { valor: 'dec', rotulo: 'Maior DEC' },
              { valor: 'fec', rotulo: 'Maior FEC' },
              { valor: 'chi', rotulo: 'Maior CHI' },
            ]}
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-legenda text-ink-2">
        <Badge variante="info">
          {pagina.total}{' '}
          {visao === 'alimentadores'
            ? 'alimentadores'
            : nivel === 'municipio'
              ? 'municípios'
              : 'bairros'}
        </Badge>
        <span>Maiores valores no período selecionado</span>
      </div>
      {visao === 'alimentadores' ? (
        <Tabela
          legenda="Ranking de alimentadores"
          linhas={dados.ranking_alimentadores.items}
          colunas={colunasAlimentadores}
          chaveLinha={(r) => r.alimentador}
          paginacao={paginacao}
          vazio={vazio}
        />
      ) : (
        <Tabela
          legenda="Ranking regional"
          linhas={dados.ranking_regional.items}
          colunas={colunasRegionais}
          chaveLinha={(r) => `${r.municipio}\u0000${r.bairro ?? ''}`}
          paginacao={paginacao}
          vazio={vazio}
        />
      )}
      {visao === 'regional' && nivel === 'bairro' && (
        <p className="mt-4 rounded-xl bg-azul-50 px-4 py-3 text-legenda leading-5 text-teal-profundo">
          O bairro seleciona os alimentadores que o atendem, preservando o denominador completo.
          Bairros que compartilham alimentadores não podem ser somados.
        </p>
      )}
    </Card>
  )
}
