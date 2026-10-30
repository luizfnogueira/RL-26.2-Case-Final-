import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { useConsulta } from '@/hooks/useConsulta'
import { buscarUnidade } from '@/services'
import type { Unidade360 } from '@/types/unidades'
import { formatarAtualizacao } from '@/utils/datas'
import { formatarNome } from '@/utils/formatacao'
import { formatarPeriodo } from '@/utils/periodos'
import BlocoDiagnostico from './BlocoDiagnostico'
import { BlocoChamados, BlocoConsumo, BlocoFaturas, BlocoInterrupcoes } from './BlocosHistorico'
import { BlocoCadastro, BlocoGeracao, BlocoMedidor } from './BlocosCadastrais'

const ESTILO_LINK =
  'inline-flex items-center gap-2 rounded-full border border-borda bg-surface-card px-4 py-2 text-corpo text-ink hover:bg-surface-alt'

function VoltarParaBusca() {
  return (
    <Link to="/unidades" className={ESTILO_LINK}>
      <ArrowLeft size={16} aria-hidden="true" />
      Voltar para a busca
    </Link>
  )
}

/** Visão 360 de uma UC (/unidades/:id): consulta, estados de carregamento e erro, e os blocos. */
export default function DetalheUnidade({ id }: { id: string }) {
  const consulta = useConsulta((sinal) => buscarUnidade(id, {}, sinal), [id])
  const { dados, erro, carregando } = consulta

  if (erro?.status === 404) {
    // A consulta deu certo e a UC não existe: estado vazio, não erro.
    return (
      <Card>
        <EmptyState
          icone={<SearchX size={26} strokeWidth={1.5} />}
          titulo="UC não encontrada"
          descricao={`Não há unidade consumidora com o código ${id}. Confira o código e busque de novo.`}
          acao={<VoltarParaBusca />}
        />
      </Card>
    )
  }
  if (erro) {
    return (
      <ErrorState
        erro={erro}
        titulo={
          erro.codigo === 'GOLD_NAO_CARREGADA' ? 'Dados ainda não carregados' : 'Algo deu errado'
        }
        aoTentarNovamente={consulta.recarregar}
        className="rounded-card bg-surface-card shadow-card"
      />
    )
  }
  // Ao trocar de UC, nunca mostra o cadastro de uma sob o código de outra.
  if (!dados || (carregando && dados.cadastro.id_uc !== id)) return <CarregandoUnidade />

  return (
    <div
      className={
        carregando ? 'flex flex-col gap-4 opacity-60 md:gap-6' : 'flex flex-col gap-4 md:gap-6'
      }
    >
      <CabecalhoUnidade unidade={dados} />
      <BlocoDiagnostico diagnostico={dados.diagnostico_conta} consumo={dados.consumo} />
      {/*
        Primeiro o que explica a conta (consumo e faturas), depois cadastro e histórico de atendimento.
        Consumo e faturas em largura inteira, um abaixo do outro: lado a lado, a lista de faturas
        esticava o cartão do gráfico (altura fixa) e deixava um vazio grande sob ele.
      */}
      <BlocoConsumo consumo={dados.consumo} />
      <BlocoFaturas
        abertas={dados.faturas_abertas}
        pagas={dados.faturas_pagas}
        periodo={dados.periodo_referencia}
      />
      {/*
        Cadastro 40%, medidor e GD 30% cada: em xl (1280 px) a leitura acumulada mais longa da Gold
        ("2.705.855 kWh em 28/06/2026") e "Geração na própria UC" cabem numa linha.
      */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)]">
        <BlocoCadastro cadastro={dados.cadastro} />
        <BlocoMedidor
          medidor={dados.medidor}
          periodo={dados.periodo_referencia}
          dataLigacao={dados.cadastro.data_ligacao}
        />
        <BlocoGeracao gd={dados.geracao_distribuida} />
      </div>
      <BlocoInterrupcoes
        recentes={dados.interrupcoes_recentes}
        total={dados.total_interrupcoes.valor}
      />
      <BlocoChamados chamados={dados.chamados} />
    </div>
  )
}

function CabecalhoUnidade({ unidade }: { unidade: Unidade360 }) {
  const { cadastro: c, metadados } = unidade
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-legenda text-ink-2">Unidade consumidora</p>
          <h2 className="text-titulo-lg font-normal">{formatarNome(c.nome_titular)}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-corpo text-ink-2">
            <strong className="font-medium text-ink">{c.id_uc}</strong>
            <span aria-hidden="true">·</span>
            {formatarNome(c.classe)}
            <span aria-hidden="true">·</span>
            {formatarNome(c.municipio)}
            <Badge variante={c.status === 'ATIVA' ? 'sucesso' : 'neutro'}>
              {formatarNome(c.status)}
            </Badge>
          </p>
        </div>
        <VoltarParaBusca />
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-legenda text-ink-2">
        <SeloFicticio metadados={metadados} />
        Período analisado: {formatarPeriodo(unidade.periodo_referencia)}
        {metadados.gold_atualizada_em && (
          <> · Dados da Gold de {formatarAtualizacao(metadados.gold_atualizada_em)}</>
        )}
      </p>
    </Card>
  )
}

function CarregandoUnidade() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando a unidade"
      className="flex flex-col gap-4 md:gap-6"
    >
      <Skeleton className="h-32 w-full rounded-card" />
      <div className="grid gap-4 md:gap-6 xl:grid-cols-[4fr_3fr_3fr]">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  )
}
