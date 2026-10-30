import { Info, Network } from 'lucide-react'
import { useSearchParams } from 'react-router'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import HistoricoOperacao from '@/components/operacao/HistoricoOperacao'
import IndicadoresOperacao from '@/components/operacao/IndicadoresOperacao'
import PeriodoOperacao from '@/components/operacao/PeriodoOperacao'
import RankingsOperacao, { type VisaoRanking } from '@/components/operacao/RankingsOperacao'
import type { IndicadorHistorico } from '@/components/operacao/formatacao'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { useConsulta } from '@/hooks/useConsulta'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import Pagina from '@/layouts/Pagina'
import { buscarOperacao } from '@/services/operacao'
import type { CampoFiltro, FiltrosUrl } from '@/types/filtros'
import type { NivelRegional, OrdenarPor, RankingRegional } from '@/types/operacao'
import { formatarAtualizacao } from '@/utils/datas'
import { formatarNome } from '@/utils/formatacao'
import { formatarPeriodo, PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO } from '@/utils/periodos'

const CAMPOS: readonly CampoFiltro[] = ['periodo_atual', 'municipio', 'bairro', 'alimentador']
const PADROES: FiltrosUrl = { periodo_atual: PERIODO_ATUAL_PADRAO }
const TAMANHO_PAGINA = 10

export default function OperacaoPage() {
  const opcoesFiltros = useOpcoesFiltros()
  const { filtros, definir, limpar } = useFiltrosUrl(CAMPOS, PADROES)
  const [params, setParams] = useSearchParams()
  const periodo = filtros.periodo_atual ?? PERIODO_ATUAL_PADRAO
  const { municipio, bairro, alimentador } = filtros
  const por = params.get('ordenar_por')
  const ordenarPor: OrdenarPor = por === 'fec' || por === 'chi' ? por : 'dec'
  const nivel: NivelRegional = params.get('nivel_regional') === 'bairro' ? 'bairro' : 'municipio'
  const visao: VisaoRanking = params.get('visao') === 'regional' ? 'regional' : 'alimentadores'
  const indicador: IndicadorHistorico = params.get('indicador') === 'fec' ? 'fec' : 'dec'
  const numeroPagina = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(numeroPagina) && numeroPagina > 0 ? numeroPagina : 1
  const consulta = useConsulta(
    (sinal) =>
      buscarOperacao(
        {
          periodo_atual: periodo,
          municipio,
          bairro,
          alimentador,
          ordenar_por: ordenarPor,
          nivel_regional: nivel,
          page,
          page_size: TAMANHO_PAGINA,
        },
        sinal,
      ),
    [periodo, municipio, bairro, alimentador, ordenarPor, nivel, page],
  )
  const dados = consulta.dados
  const destaque = dados?.ranking_alimentadores.items[0]
  const serie =
    dados?.serie_historica.find((s) => s.alimentador === destaque?.alimentador) ??
    dados?.serie_historica[0]
  const semDados =
    dados && dados.serie_historica.length === 0 && dados.ranking_alimentadores.total === 0
  const periodos = [
    ...new Set([
      ...(opcoesFiltros.opcoes.periodos ?? [PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO]),
      periodo,
    ]),
  ]

  function controlar(valores: Record<string, string>, preservarPagina = false) {
    setParams(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        for (const [campo, valor] of Object.entries(valores)) {
          if (valor) novos.set(campo, valor)
          else novos.delete(campo)
        }
        if (!preservarPagina && !('page' in valores)) novos.delete('page')
        return novos
      },
      { replace: true },
    )
  }

  function abrirRegiao(regiao: RankingRegional) {
    setParams(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        novos.set('municipio', regiao.municipio)
        if (regiao.bairro) novos.set('bairro', regiao.bairro)
        else novos.delete('bairro')
        novos.delete('alimentador')
        novos.delete('page')
        novos.set('visao', 'alimentadores')
        return novos
      },
      { replace: true },
    )
  }

  return (
    <Pagina
      titulo="Continuidade DEC / FEC"
      subtitulo="Qualidade do fornecimento, evolução mensal e prioridades de operação"
      goldAtualizadaEm={dados?.metadados.gold_atualizada_em ?? null}
    >
      <BarraDeFiltros
        campos={CAMPOS}
        padroes={PADROES}
        opcoes={{ ...opcoesFiltros.opcoes, periodos }}
        mostrarLimparSempre
      />
      <PeriodoOperacao
        key={periodo}
        periodo={periodo}
        aoAplicar={(valor) => definir({ periodo_atual: valor })}
      />
      {opcoesFiltros.erro && (
        <p role="status" className="text-legenda text-ink-2">
          As opções de região não puderam ser carregadas. A consulta do período continua disponível.
        </p>
      )}
      {consulta.erro ? (
        <ErrorState
          erro={consulta.erro}
          aoTentarNovamente={consulta.recarregar}
          className="rounded-card bg-surface-card shadow-card"
        />
      ) : consulta.carregando ? (
        <div aria-label="Carregando operação" aria-busy="true" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {['dec', 'fec', 'interrupcoes', 'chi'].map((campo) => (
              <Skeleton key={campo} className="h-36 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-card" />
          <Skeleton className="h-80 rounded-card" />
        </div>
      ) : dados ? (
        semDados ? (
          <EmptyState
            titulo="Sem dados de operação para este recorte"
            descricao="Não há alimentadores com indicadores no período e na região selecionados."
            acao={
              <Button variante="secundario" onClick={limpar}>
                Limpar recorte
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-titulo-lg">
                  <Network size={20} className="text-teal-escuro" aria-hidden="true" />
                  {destaque
                    ? `Alimentador em análise: ${destaque.alimentador}`
                    : 'Análise de continuidade'}
                </h2>
                <p className="mt-1 text-legenda text-ink-2">
                  {formatarPeriodo(dados.filtros.periodo_atual)}
                  {destaque &&
                    ` · ${formatarNome(destaque.municipio)} · ${destaque.ucs_atendidas.toLocaleString('pt-BR')} UCs atendidas`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SeloFicticio metadados={dados.metadados} />
                <Badge variante="info">
                  {dados.ranking_alimentadores.total} alimentadores no recorte
                </Badge>
                {alimentador && (
                  <Button
                    variante="fantasma"
                    tamanho="sm"
                    onClick={() => definir({ alimentador: '' })}
                  >
                    Ver todos os alimentadores
                  </Button>
                )}
              </div>
            </div>
            {destaque && <IndicadoresOperacao alimentador={destaque} />}
            <p className="flex items-start gap-2 rounded-xl bg-azul-50 px-4 py-3 text-legenda leading-5 text-teal-profundo">
              <Info size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-medium">Como ler:</strong> DEC mede a duração em horas por
                UC; FEC mede a frequência de interrupções por UC. CHI soma as horas de interrupção
                dos consumidores. No período, DEC e FEC somam os índices mensais. Os valores acima
                se referem ao alimentador em análise.
              </span>
            </p>
            {serie ? (
              <HistoricoOperacao
                key={`${serie.alimentador}:${periodo}`}
                serie={serie}
                indicador={indicador}
                aoMudarIndicador={(valor) => controlar({ indicador: valor }, true)}
              />
            ) : (
              <EmptyState
                titulo="Histórico indisponível"
                descricao="A fonte não retornou a série mensal deste alimentador."
              />
            )}
            <RankingsOperacao
              dados={dados}
              visao={visao}
              ordenarPor={ordenarPor}
              nivel={nivel}
              aoMudarVisao={(valor) => controlar({ visao: valor })}
              aoOrdenar={(valor) => controlar({ ordenar_por: valor })}
              aoMudarNivel={(valor) => controlar({ nivel_regional: valor })}
              aoMudarPagina={(valor) => controlar({ page: valor > 1 ? String(valor) : '' })}
              aoSelecionarAlimentador={(valor) => definir({ alimentador: valor })}
              aoSelecionarRegiao={abrirRegiao}
            />
            <footer className="text-legenda leading-5 text-ink-2">
              <p>
                {dados.metadados.dados_ficticios
                  ? 'Fonte de demonstração.'
                  : 'Fonte: Gold PostgreSQL.'}
                {dados.metadados.gold_atualizada_em
                  ? ` Atualização da fonte: ${formatarAtualizacao(dados.metadados.gold_atualizada_em)}.`
                  : ' Data de atualização não informada pela fonte.'}
              </p>
              <details className="mt-2">
                <summary className="w-fit cursor-pointer rounded-sm text-teal-profundo">
                  Regras e observações da fonte
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {dados.metadados.observacoes.map((obs, i) => (
                    <li key={i}>{obs}</li>
                  ))}
                </ul>
              </details>
            </footer>
          </>
        )
      ) : null}
    </Pagina>
  )
}
