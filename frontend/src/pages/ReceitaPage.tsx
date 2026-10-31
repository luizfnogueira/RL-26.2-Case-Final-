import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import AnaliseIA from '@/components/receita/AnaliseIA'
import DrillDownReceita from '@/components/receita/DrillDownReceita'
import ExplicacaoDoResultado from '@/components/receita/ExplicacaoDoResultado'
import { explicarResultado, numerosDoInsight } from '@/components/receita/explicacao'
import PonteDaReceita from '@/components/receita/PonteDaReceita'
import ErrorState from '@/components/ui/ErrorState'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { useConsulta } from '@/hooks/useConsulta'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import Pagina from '@/layouts/Pagina'
import { buscarDashboard, gerarInsight } from '@/services'
import type { CampoFiltro, FiltrosUrl } from '@/types/filtros'
import type { NivelDrill } from '@/types/dashboard'
import { PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO } from '@/utils/periodos'

const CAMPOS: readonly CampoFiltro[] = [
  'periodo_atual',
  'periodo_comparacao',
  'municipio',
  'bairro',
  'classe',
]
const PADROES: FiltrosUrl = {
  periodo_atual: PERIODO_ATUAL_PADRAO,
  periodo_comparacao: PERIODO_COMPARACAO_PADRAO,
}
const LINHAS_POR_PAGINA = 10

/** Tela 2: o que mudou na receita de energia entre dois períodos e onde o volume caiu. */
export default function ReceitaPage() {
  const opcoesFiltros = useOpcoesFiltros()
  const { filtros, definir } = useFiltrosUrl(CAMPOS, PADROES)
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)

  const periodoAtual = filtros.periodo_atual ?? PERIODO_ATUAL_PADRAO
  const periodoComparacao = filtros.periodo_comparacao ?? PERIODO_COMPARACAO_PADRAO
  const { municipio, bairro, classe } = filtros
  // O nível do drill-down acompanha os filtros: sem município lista municípios, e assim por diante.
  const nivel: NivelDrill = !municipio ? 'municipio' : !bairro ? 'bairro' : 'classe'

  const dashboard = useConsulta(
    (sinal) =>
      buscarDashboard(
        {
          periodo_atual: periodoAtual,
          periodo_comparacao: periodoComparacao,
          municipio,
          bairro,
          classe,
          nivel,
          page,
          page_size: LINHAS_POR_PAGINA,
        },
        sinal,
      ),
    [periodoAtual, periodoComparacao, municipio, bairro, classe, nivel, page],
  )
  const dados = dashboard.dados

  // Só vale a análise de uma resposta que corresponde aos filtros atuais (evita enviar números
  // de uma consulta antiga enquanto a nova carrega).
  const numeros = useMemo(() => {
    if (!dados) return null
    const f = dados.filtros
    const igual =
      f.periodo_atual === periodoAtual &&
      f.periodo_comparacao === periodoComparacao &&
      (f.municipio ?? undefined) === municipio &&
      (f.bairro ?? undefined) === bairro &&
      (f.classe ?? undefined) === classe
    return igual ? numerosDoInsight(dados) : null
  }, [dados, periodoAtual, periodoComparacao, municipio, bairro, classe])
  const chaveNumeros = numeros?.map((n) => n.valor).join('|') ?? ''

  const insight = useConsulta(
    (sinal) =>
      gerarInsight(
        {
          contexto: 'receita',
          filtros: {
            periodo_atual: periodoAtual,
            periodo_comparacao: periodoComparacao,
            municipio: municipio ?? null,
            bairro: bairro ?? null,
            classe: classe ?? null,
          },
          indicadores: numeros ?? undefined,
        },
        sinal,
      ),
    [periodoAtual, periodoComparacao, municipio, bairro, classe, chaveNumeros],
    { habilitada: numeros !== null },
  )

  const mudarPagina = (proxima: number) =>
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual)
        if (proxima > 1) novo.set('page', String(proxima))
        else novo.delete('page')
        return novo
      },
      { replace: true },
    )

  const atualizando = dashboard.carregando && dados !== null
  const semDecomposicao = dados !== null && numerosDoInsight(dados) === null
  // Fora de P1 × P2 ou com alimentador, a API zera a ponte, esvazia o drill-down e explica o motivo
  // na última observação; KPIs e série seguem normais.
  const motivoSemDecomposicao = semDecomposicao ? dados?.metadados.observacoes.at(-1) : undefined

  return (
    <Pagina
      titulo="Diagnóstico da receita"
      subtitulo="Decomposição da variação de preço e volume da receita de energia"
    >
      <BarraDeFiltros campos={CAMPOS} padroes={PADROES} opcoes={opcoesFiltros.opcoes} />

      {dashboard.erro && !dados ? (
        <ErrorState erro={dashboard.erro} aoTentarNovamente={dashboard.recarregar} />
      ) : !dados ? (
        <CarregandoReceita />
      ) : (
        <>
          {dashboard.erro && (
            <ErrorState
              erro={dashboard.erro}
              titulo="Não foi possível atualizar"
              aoTentarNovamente={dashboard.recarregar}
              className="rounded-card bg-surface-card py-6 shadow-card"
            />
          )}
          <AnaliseIA
            consulta={insight}
            indisponivel={
              semDecomposicao
                ? 'A análise automática depende da decomposição de preço e volume, que não existe para este recorte.'
                : undefined
            }
          />
          <div className="grid gap-4 md:gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <PonteDaReceita dashboard={dados} atualizando={atualizando} />
            <ExplicacaoDoResultado pontos={explicarResultado(dados)} atualizando={atualizando} />
          </div>
          <DrillDownReceita
            drill={dados.drill_down}
            carregando={atualizando}
            periodoAtual={periodoAtual}
            periodoComparacao={periodoComparacao}
            aoSelecionar={(linha) =>
              definir({
                municipio: linha.filtros.municipio ?? '',
                bairro: linha.filtros.bairro ?? '',
              })
            }
            aoNavegar={(item) =>
              definir({
                municipio: item.filtros.municipio ?? '',
                bairro: item.filtros.bairro ?? '',
              })
            }
            aoMudarPagina={mudarPagina}
            motivoVazio={motivoSemDecomposicao}
          />
          <p className="flex items-center gap-2 text-legenda text-ink-2">
            <SeloFicticio metadados={dados.metadados} />
            {dados.metadados.observacoes.at(0)}
          </p>
        </>
      )}
    </Pagina>
  )
}

function CarregandoReceita() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando o diagnóstico"
      className="flex flex-col gap-4 md:gap-6"
    >
      <Skeleton className="h-36 w-full rounded-card" />
      <div className="grid gap-4 md:gap-6 xl:grid-cols-[3fr_2fr]">
        <Skeleton className="h-80 rounded-card" />
        <Skeleton className="h-80 rounded-card" />
      </div>
      <Skeleton className="h-96 w-full rounded-card" />
    </div>
  )
}
