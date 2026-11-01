import { X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import SeletorDeItens from '@/components/filtros/SeletorDeItens'
import { selecaoValida, type SelecaoItens } from '@/components/filtros/selecaoItens'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { useComparacaoUrl } from '@/hooks/useComparacaoUrl'
import { useConsulta } from '@/hooks/useConsulta'
import type { ResultadoOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import { buscarComparacao } from '@/services/dashboard'
import type { CampoFiltro } from '@/types/filtros'
import { formatarAtualizacao } from '@/utils/datas'
import { formatarNome } from '@/utils/formatacao'
import { formatarPeriodo, PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO } from '@/utils/periodos'
import TabelaComparacao from './TabelaComparacao'

const PADROES = {
  periodo_atual: PERIODO_ATUAL_PADRAO,
  periodo_comparacao: PERIODO_COMPARACAO_PADRAO,
}
const ROTULOS = { municipio: 'Municípios', bairro: 'Bairros', classe: 'Classes' } as const

export default function ComparacaoRecortes({
  opcoesFiltros,
}: {
  opcoesFiltros: ResultadoOpcoesFiltros
}) {
  const comparacao = useComparacaoUrl()
  const [params] = useSearchParams()
  // C1 usa parâmetros repetidos. Uma vírgula pode fazer parte do nome do bairro;
  // não tratar esse caractere como separador na integração com o seletor C4.
  const itens = params
    .getAll('itens')
    .map((v) => v.trim())
    .filter(Boolean)
  const filtros = { ...comparacao.filtros, itens }
  const selecao: SelecaoItens = { nivel: filtros.nivel, municipio: filtros.municipio, itens }
  const valida = selecaoValida(selecao)
  const consulta = useConsulta(
    (sinal) =>
      buscarComparacao(
        {
          periodo_atual: filtros.periodo_atual,
          periodo_comparacao: filtros.periodo_comparacao,
          nivel: filtros.nivel,
          municipio: filtros.municipio,
          bairro: filtros.bairro,
          itens,
        },
        sinal,
      ),
    [
      filtros.periodo_atual,
      filtros.periodo_comparacao,
      filtros.nivel,
      filtros.municipio,
      filtros.bairro,
      JSON.stringify(itens),
    ],
    { habilitada: valida },
  )
  const campos: readonly CampoFiltro[] =
    filtros.nivel === 'classe'
      ? ['periodo_atual', 'periodo_comparacao', 'municipio', 'bairro']
      : ['periodo_atual', 'periodo_comparacao']
  const periodos = [
    ...new Set([
      ...(opcoesFiltros.opcoes.periodos ?? [PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO]),
      filtros.periodo_atual,
      filtros.periodo_comparacao,
    ]),
  ]

  function escolher(valor: SelecaoItens) {
    const mesmoNivel = valor.nivel === filtros.nivel
    comparacao.definir({
      aba: 'comparar',
      nivel: valor.nivel,
      itens: valor.itens,
      municipio: valor.nivel === 'municipio' ? undefined : valor.municipio,
      bairro: valor.nivel === 'classe' && mesmoNivel ? filtros.bairro : undefined,
    })
  }

  return (
    <section
      role="tabpanel"
      id="painel-comparar"
      aria-labelledby="aba-comparar"
      className="flex flex-col gap-4"
    >
      <BarraDeFiltros
        campos={campos}
        padroes={PADROES}
        opcoes={{ ...opcoesFiltros.opcoes, periodos }}
      />
      <div className="flex justify-end">
        <Button
          variante="fantasma"
          tamanho="sm"
          onClick={() =>
            comparacao.definir({
              periodo_atual: filtros.periodo_comparacao,
              periodo_comparacao: filtros.periodo_atual,
            })
          }
        >
          Inverter períodos
        </Button>
      </div>
      <Card
        titulo="Escolha os recortes"
        subtitulo="Compare de 2 a 4 itens do mesmo nível, nos mesmos períodos."
      >
        {opcoesFiltros.carregando ? (
          <div role="status" aria-label="Carregando opções de comparação" aria-busy="true">
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto p-1">
            <SeletorDeItens opcoes={opcoesFiltros.opcoes} valor={selecao} aoMudar={escolher} />
          </div>
        )}
        {opcoesFiltros.erro && (
          <p role="status" className="mt-3 text-legenda text-ink-2">
            Não foi possível carregar as opções de recortes. Recarregue a página para tentar
            novamente. A comparação do link continua disponível.
          </p>
        )}
        {filtros.nivel === 'classe' && (
          <p className="mt-3 text-legenda text-ink-2">
            Município e bairro são filtros opcionais das classes. Sem filtro pai, a comparação
            considera toda a área.
          </p>
        )}
        {itens.length > 0 && (
          <div
            className="mt-4 flex flex-wrap items-center gap-2"
            aria-label="Recortes selecionados"
          >
            {itens.map((item, i) => (
              <Button
                key={`${item}:${i}`}
                variante="secundario"
                tamanho="sm"
                aria-label={`Remover ${formatarNome(item)}`}
                onClick={() =>
                  escolher({ ...selecao, itens: itens.filter((_, indice) => indice !== i) })
                }
              >
                {formatarNome(item)}
                <X size={14} aria-hidden="true" />
              </Button>
            ))}
            <Button
              variante="fantasma"
              tamanho="sm"
              onClick={() =>
                comparacao.definir({
                  aba: 'comparar',
                  nivel: 'municipio',
                  itens: [],
                  municipio: undefined,
                  bairro: undefined,
                  ...PADROES,
                })
              }
            >
              Limpar comparação
            </Button>
          </div>
        )}
      </Card>

      {!valida ? (
        <EmptyState
          titulo="Selecione de 2 a 4 itens para comparar"
          descricao={
            itens.length > 4
              ? 'O link contém mais de 4 recortes. Remova itens para continuar.'
              : filtros.nivel === 'bairro' && !filtros.municipio
                ? 'Escolha o município antes de selecionar os bairros.'
                : new Set(itens).size !== itens.length
                  ? 'A seleção contém itens repetidos. Remova as repetições.'
                  : 'Escolha municípios, bairros ou classes no seletor acima.'
          }
        />
      ) : consulta.erro ? (
        <ErrorState
          erro={consulta.erro}
          aoTentarNovamente={consulta.recarregar}
          className="rounded-card bg-surface-card shadow-card"
        />
      ) : consulta.carregando ? (
        <div
          aria-label="Carregando comparação de recortes"
          aria-busy="true"
          className="space-y-3 rounded-card bg-surface-card p-6 shadow-card"
        >
          <Skeleton className="h-8 w-64" />
          {['ucs', 'receita', 'consumo', 'aberto', 'dec', 'fec'].map((k) => (
            <Skeleton key={k} className="h-24 w-full" />
          ))}
        </div>
      ) : consulta.dados ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-titulo-lg">Comparação de recortes</h2>
              <p className="mt-1 text-legenda text-ink-2">
                {formatarPeriodo(consulta.dados.filtros.periodo_atual)} vs.{' '}
                {formatarPeriodo(
                  consulta.dados.filtros.periodo_comparacao ?? filtros.periodo_comparacao,
                )}{' '}
                · {ROTULOS[consulta.dados.filtros.nivel]}
              </p>
              {filtros.municipio && (
                <p className="mt-1 text-legenda text-ink-2">
                  Município: {formatarNome(filtros.municipio)}
                  {filtros.bairro ? ` · Bairro: ${formatarNome(filtros.bairro)}` : ''}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variante="info">{consulta.dados.itens.length} recortes comparados</Badge>
              <SeloFicticio metadados={consulta.dados.metadados} />
            </div>
          </div>
          {consulta.dados.itens.length > 0 ? (
            <TabelaComparacao dados={consulta.dados} />
          ) : (
            <EmptyState
              titulo="Nenhum recorte retornado"
              descricao="A fonte não retornou itens para esta comparação. Revise a seleção."
            />
          )}
          <footer className="text-legenda leading-5 text-ink-2">
            <p>
              {consulta.dados.metadados.dados_ficticios
                ? 'Fonte de demonstração.'
                : 'Fonte: Gold PostgreSQL.'}
              {consulta.dados.metadados.gold_atualizada_em
                ? ` Atualização da fonte: ${formatarAtualizacao(consulta.dados.metadados.gold_atualizada_em)}.`
                : ' Data de atualização não informada pela fonte.'}
            </p>
            {consulta.dados.metadados.observacoes.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {consulta.dados.metadados.observacoes.map((obs, i) => (
                  <li key={i}>{obs}</li>
                ))}
              </ul>
            )}
          </footer>
        </>
      ) : null}
    </section>
  )
}
