import { ArrowRight, ChartNoAxesCombined } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import HistoricoExecutivo from '@/components/painel/HistoricoExecutivo'
import IndicadoresExecutivos from '@/components/painel/IndicadoresExecutivos'
import { leituraDoPeriodo, ORDEM_KPIS } from '@/components/painel/indicadores'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { useComparacaoUrl } from '@/hooks/useComparacaoUrl'
import { useConsulta } from '@/hooks/useConsulta'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import Pagina from '@/layouts/Pagina'
import { buscarComparacao, buscarDashboard } from '@/services/dashboard'
import { construirQuery } from '@/services/http'
import type { CampoFiltro, FiltrosUrl } from '@/types/filtros'
import { cx } from '@/utils/cx'
import { formatarAtualizacao } from '@/utils/datas'
import { formatarNome } from '@/utils/formatacao'
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
  const opcoesFiltros = useOpcoesFiltros()
  const { filtros } = useFiltrosUrl(CAMPOS, PADROES)
  const [, setParams] = useSearchParams()
  const comparacaoUrl = useComparacaoUrl()
  const estaNaComparacao = comparacaoUrl.estaAtiva

  const periodo_atual = filtros.periodo_atual ?? PERIODO_ATUAL_PADRAO
  const periodo_comparacao = filtros.periodo_comparacao ?? PERIODO_COMPARACAO_PADRAO
  const { municipio } = filtros
  const consulta = useConsulta(
    (sinal) => buscarDashboard({ periodo_atual, periodo_comparacao, municipio }, sinal),
    [periodo_atual, periodo_comparacao, municipio],
    { habilitada: !estaNaComparacao },
  )

  const consultaComparacao = useConsulta(
    (sinal) =>
      buscarComparacao(
        {
          periodo_atual: comparacaoUrl.filtros.periodo_atual,
          periodo_comparacao: comparacaoUrl.filtros.periodo_comparacao,
          nivel: comparacaoUrl.filtros.nivel,
          itens: comparacaoUrl.filtros.itens,
          municipio: comparacaoUrl.filtros.municipio,
          bairro: comparacaoUrl.filtros.bairro,
        },
        sinal,
      ),
    [
      comparacaoUrl.filtros.periodo_atual,
      comparacaoUrl.filtros.periodo_comparacao,
      comparacaoUrl.filtros.nivel,
      comparacaoUrl.filtros.itens.join(','),
      comparacaoUrl.filtros.municipio,
      comparacaoUrl.filtros.bairro,
    ],
    { habilitada: estaNaComparacao && comparacaoUrl.filtros.itens.length >= 2 },
  )

  const dados = consulta.dados
  const semDados =
    dados &&
    ORDEM_KPIS.every((nome) => dados.indicadores[nome].atual.valor === null) &&
    !dados.serie_historica.some((p) => p.receita.valor !== null || p.energia.valor !== null)

  const alternarAba = (novaAba: 'geral' | 'comparar') => {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        if (novaAba === 'comparar') {
          proximo.set('aba', 'comparar')
        } else {
          proximo.delete('aba')
        }
        return proximo
      },
      { replace: true },
    )
  }

  return (
    <Pagina titulo="Painel executivo" subtitulo="Visão consolidada da saúde do negócio">
      <div
        role="tablist"
        aria-label="Abas do painel executivo"
        className="flex w-fit gap-1 rounded-full bg-surface-alt p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={!estaNaComparacao}
          onClick={() => alternarAba('geral')}
          className={cx(
            'cursor-pointer rounded-full px-3.5 py-1 text-legenda transition-colors',
            !estaNaComparacao
              ? 'bg-surface-card font-medium text-teal-profundo shadow-sm'
              : 'text-ink-2 hover:text-ink',
          )}
        >
          Visão geral
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={estaNaComparacao}
          onClick={() => alternarAba('comparar')}
          className={cx(
            'cursor-pointer rounded-full px-3.5 py-1 text-legenda transition-colors',
            estaNaComparacao
              ? 'bg-surface-card font-medium text-teal-profundo shadow-sm'
              : 'text-ink-2 hover:text-ink',
          )}
        >
          Comparar
        </button>
      </div>

      {!estaNaComparacao ? (
        <>
          <BarraDeFiltros
            campos={CAMPOS}
            padroes={PADROES}
            opcoes={opcoesFiltros.opcoes}
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
                      {formatarPeriodo(dados.filtros.periodo_atual)}{' '}
                      <span className="mx-1">vs.</span>{' '}
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
        </>
      ) : (
        <section
          role="tabpanel"
          aria-label="Aba de comparação"
          className="flex flex-col gap-4"
        >
          {comparacaoUrl.filtros.itens.length < 2 ? (
            <EmptyState
              titulo="Selecione de 2 a 4 itens para comparar"
              descricao="Escolha municípios, bairros ou classes para comparar os indicadores lado a lado."
            />
          ) : consultaComparacao.erro ? (
            <ErrorState
              erro={consultaComparacao.erro}
              aoTentarNovamente={consultaComparacao.recarregar}
              className="rounded-card bg-surface-card shadow-card"
            />
          ) : consultaComparacao.carregando ? (
            <div
              aria-label="Carregando comparação de recortes"
              aria-busy="true"
              className="flex flex-col gap-4"
            >
              <Skeleton className="h-48 w-full rounded-card" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {comparacaoUrl.filtros.itens.map((i) => (
                  <Skeleton key={i} className="h-64 rounded-card" />
                ))}
              </div>
            </div>
          ) : consultaComparacao.dados ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-titulo-lg">Comparação de recortes</h2>
                  <p className="mt-1 text-legenda text-ink-2">
                    {formatarPeriodo(consultaComparacao.dados.filtros.periodo_atual)}{' '}
                    <span className="mx-1">vs.</span>{' '}
                    {formatarPeriodo(
                      consultaComparacao.dados.filtros.periodo_comparacao ??
                        comparacaoUrl.filtros.periodo_comparacao,
                    )}
                    {' · '}Nível: {formatarNome(consultaComparacao.dados.filtros.nivel)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variante="info">
                    {consultaComparacao.dados.itens.length} recortes comparados
                  </Badge>
                  <SeloFicticio metadados={consultaComparacao.dados.metadados} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {consultaComparacao.dados.itens.map((item) => (
                  <div
                    key={item.nome}
                    className="rounded-card border border-borda bg-surface-card p-4 shadow-card"
                  >
                    <h3 className="text-titulo-sm font-medium text-ink">{formatarNome(item.nome)}</h3>
                    <p className="mt-1 text-legenda text-ink-2">
                      {item.ucs_ativas.atual.valor ?? 0} UCs ativas
                    </p>
                    <div className="mt-3 flex flex-col gap-2 text-corpo">
                      <div className="flex justify-between">
                        <span className="text-ink-2">Receita/UC:</span>
                        <span className="font-medium text-ink">
                          {item.receita_media_uc.atual.valor !== null
                            ? `R$ ${item.receita_media_uc.atual.valor.toFixed(2)}`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-2">Consumo/UC:</span>
                        <span className="font-medium text-ink">
                          {item.consumo_medio_uc.atual.valor !== null
                            ? `${item.consumo_medio_uc.atual.valor} kWh`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-2">Em aberto:</span>
                        <span className="font-medium text-ink">
                          {item.valor_em_aberto_pct.atual.valor !== null
                            ? `${item.valor_em_aberto_pct.atual.valor}%`
                            : '—'}
                        </span>
                      </div>
                      {item.dec.atual.valor !== null && (
                        <div className="flex justify-between">
                          <span className="text-ink-2">DEC:</span>
                          <span className="font-medium text-ink">{item.dec.atual.valor} h</span>
                        </div>
                      )}
                      {item.fec.atual.valor !== null && (
                        <div className="flex justify-between">
                          <span className="text-ink-2">FEC:</span>
                          <span className="font-medium text-ink">{item.fec.atual.valor}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {consultaComparacao.dados.metadados.observacoes.length > 0 && (
                <ul className="text-legenda leading-5 text-ink-2">
                  {consultaComparacao.dados.metadados.observacoes.map((obs) => (
                    <li key={obs}>{obs}</li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </section>
      )}
    </Pagina>
  )
}
