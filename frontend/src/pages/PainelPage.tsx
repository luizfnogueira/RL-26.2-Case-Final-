import { ArrowRight, ChartNoAxesCombined } from 'lucide-react'
import { Link } from 'react-router'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import HistoricoExecutivo from '@/components/painel/HistoricoExecutivo'
import IndicadoresExecutivos from '@/components/painel/IndicadoresExecutivos'
import { leituraDoPeriodo, ORDEM_KPIS } from '@/components/painel/indicadores'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { OPCOES_FILTROS_MOCK } from '@/data/filtros.mock'
import { useConsulta } from '@/hooks/useConsulta'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import Pagina from '@/layouts/Pagina'
import { buscarDashboard } from '@/services/dashboard'
import { construirQuery } from '@/services/http'
import type { CampoFiltro, FiltrosUrl } from '@/types/filtros'
import { formatarAtualizacao } from '@/utils/datas'
import {
  duracaoEmMeses,
  formatarPeriodo,
  PERIODO_ATUAL_PADRAO,
  PERIODO_COMPARACAO_PADRAO,
} from '@/utils/periodos'

const CAMPOS: readonly CampoFiltro[] = ['periodo_atual', 'periodo_comparacao', 'municipio']
const PADROES: FiltrosUrl = {
  periodo_atual: PERIODO_ATUAL_PADRAO,
  periodo_comparacao: PERIODO_COMPARACAO_PADRAO,
}

export default function PainelPage() {
  const { filtros } = useFiltrosUrl(CAMPOS, PADROES)
  const periodo_atual = filtros.periodo_atual ?? PERIODO_ATUAL_PADRAO
  const periodo_comparacao = filtros.periodo_comparacao ?? PERIODO_COMPARACAO_PADRAO
  const { municipio } = filtros
  const consulta = useConsulta(
    (sinal) => buscarDashboard({ periodo_atual, periodo_comparacao, municipio }, sinal),
    [periodo_atual, periodo_comparacao, municipio],
  )
  const dados = consulta.dados
  const semDados =
    dados &&
    ORDEM_KPIS.every((nome) => dados.indicadores[nome].atual.valor === null) &&
    !dados.serie_historica.some((p) => p.receita.valor !== null || p.energia.valor !== null)
  return (
    <Pagina titulo="Painel executivo" subtitulo="Visão consolidada da saúde do negócio">
      <BarraDeFiltros
        campos={CAMPOS}
        padroes={PADROES}
        opcoes={OPCOES_FILTROS_MOCK}
        mostrarLimparSempre
      />
      {consulta.erro ? (
        <ErrorState
          erro={consulta.erro}
          aoTentarNovamente={consulta.recarregar}
          className="rounded-card bg-surface-card shadow-card"
        />
      ) : consulta.carregando ? (
        <div
          aria-label="Carregando painel executivo"
          aria-busy="true"
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {ORDEM_KPIS.map((nome) => (
              <Skeleton key={nome} className="h-60 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-card" />
        </div>
      ) : dados ? (
        <>
          <section aria-labelledby="resumo-painel" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="resumo-painel" className="text-titulo-lg">
                  Resumo do período
                </h2>
                <p className="mt-1 text-legenda text-ink-2">
                  {formatarPeriodo(dados.filtros.periodo_atual)} <span className="mx-1">vs.</span>{' '}
                  {formatarPeriodo(dados.filtros.periodo_comparacao ?? periodo_comparacao)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variante="info">
                  {duracaoEmMeses(dados.filtros.periodo_atual)} meses consolidados
                </Badge>
                <SeloFicticio metadados={dados.metadados} />
              </div>
            </div>
            {semDados ? (
              <EmptyState
                titulo="Sem dados para este recorte"
                descricao="A fonte não retornou indicadores ou histórico. Escolha outro município ou período."
              />
            ) : (
              <IndicadoresExecutivos indicadores={dados.indicadores} />
            )}
          </section>
          {!semDados && (
            <>
              <HistoricoExecutivo pontos={dados.serie_historica} />
              <div className="flex flex-col justify-between gap-4 rounded-card border border-teal/15 bg-azul-50 p-4 sm:flex-row sm:items-center md:px-6">
                <div className="flex items-start gap-3">
                  <ChartNoAxesCombined
                    size={22}
                    className="mt-0.5 shrink-0 text-teal-profundo"
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="text-corpo font-medium text-teal-profundo">
                      Leitura do período
                    </h2>
                    <p className="mt-1 max-w-2xl text-corpo leading-5 text-ink">
                      {leituraDoPeriodo(dados.indicadores)}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/receita${construirQuery({ periodo_atual, periodo_comparacao, municipio })}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-corpo font-normal text-teal-profundo hover:bg-azul-100"
                >
                  Ver diagnóstico da receita <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </>
          )}
          <p className="text-legenda leading-5 text-ink-2">
            {dados.metadados.gold_atualizada_em && (
              <>Atualização da fonte: {formatarAtualizacao(dados.metadados.gold_atualizada_em)}. </>
            )}
            {dados.metadados.observacoes[0]}
          </p>
        </>
      ) : null}
    </Pagina>
  )
}
