import {
  Check,
  ClipboardPlus,
  Download,
  LockKeyhole,
  Plus,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import Aviso from '@/components/ui/Aviso'
import Badge, { type VarianteBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Paginacao from '@/components/ui/Paginacao'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { useConsulta } from '@/hooks/useConsulta'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import Pagina from '@/layouts/Pagina'
import { buscarCandidatos, criarInspecoesEmLote, falhasDoLote, normalizarErro } from '@/services'
import type { Candidato, ConfiancaEvidencia, Ordem } from '@/types/inspecoes'
import type { CampoFiltro, FiltrosUrl } from '@/types/filtros'
import { formatarAtualizacao } from '@/utils/datas'
import { formatarEnergia, formatarNome } from '@/utils/formatacao'
import { gerarCsvCandidatos } from '@/utils/exportarCandidatos'
import { PERIODO_ATUAL_PADRAO } from '@/utils/periodos'

const CAMPOS: readonly CampoFiltro[] = [
  'periodo_atual',
  'municipio',
  'bairro',
  'classe',
  'alimentador',
]
const PADROES: FiltrosUrl = {
  periodo_atual: PERIODO_ATUAL_PADRAO,
}
const LINHAS_POR_PAGINA = 20
const ACAO_RECOMENDADA = {
  INSPECAO_PRIORITARIA: { rotulo: 'Inspeção prioritária', variante: 'sucesso' as const },
  VALIDACAO_DOCUMENTAL: { rotulo: 'Validação documental', variante: 'alerta' as const },
}

const CONFIANCA: Record<ConfiancaEvidencia, { rotulo: string; variante: VarianteBadge }> = {
  ALTA: { rotulo: 'Alta', variante: 'sucesso' },
  MEDIA: { rotulo: 'Média', variante: 'alerta' },
  BAIXA: { rotulo: 'Baixa', variante: 'neutro' },
  INDETERMINADA: { rotulo: 'Indeterminada', variante: 'neutro' },
}

function formatarMotivos(motivos: string[]) {
  return motivos.map((motivo) => (
    <span
      key={motivo}
      className="inline-flex rounded-full border border-teal/20 bg-azul-50 px-2 py-0.5 text-micro font-medium text-teal-profundo"
    >
      {motivo}
    </span>
  ))
}

export default function FilaPage() {
  const opcoesFiltros = useOpcoesFiltros()
  const { filtros, limpar } = useFiltrosUrl(CAMPOS, PADROES)
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)
  const semOrdemAtiva = params.get('sem_ordem_ativa') === 'true'

  const periodoAtual = filtros.periodo_atual ?? PERIODO_ATUAL_PADRAO
  const { municipio, bairro, classe, alimentador } = filtros

  const [selecao, setSelecao] = useState<{
    chave: string
    itens: Record<string, Candidato>
  }>({ chave: '', itens: {} })
  const [modalAberto, setModalAberto] = useState(false)
  const [equipe, setEquipe] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')
  const [erroCriacao, setErroCriacao] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [toast, setToast] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [criadas, setCriadas] = useState<Ordem[] | null>(null)

  const candidatos = useConsulta(
    (sinal) =>
      buscarCandidatos(
        {
          periodo_atual: periodoAtual,
          municipio,
          bairro,
          classe,
          alimentador,
          sem_ordem_ativa: semOrdemAtiva,
          page,
          page_size: LINHAS_POR_PAGINA,
        },
        sinal,
      ),
    [periodoAtual, municipio, bairro, classe, alimentador, semOrdemAtiva, page],
  )

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  // A seleção vale para as UCs do recorte atual: mudar filtro, período ou a própria fila
  // (ordem criada em outra aba) não pode manter selecionada uma UC que saiu do resultado.
  const chaveRecorte = [periodoAtual, municipio, bairro, classe, alimentador, semOrdemAtiva].join(
    '|',
  )
  const selecionadas = selecao.chave === chaveRecorte ? selecao.itens : {}
  const quantidadeSelecionada = Object.keys(selecionadas).length
  const dados = candidatos.dados

  const alternarSelecao = (candidato: Candidato) => {
    if (candidato.ordem_ativa || candidato.acao_recomendada !== 'INSPECAO_PRIORITARIA') return
    setSelecao((atual) => {
      const base = atual.chave === chaveRecorte ? atual.itens : {}
      const proximo = { ...base }
      if (proximo[candidato.id_uc]) delete proximo[candidato.id_uc]
      else proximo[candidato.id_uc] = candidato
      return { chave: chaveRecorte, itens: proximo }
    })
  }

  const limparSelecao = () => setSelecao({ chave: chaveRecorte, itens: {} })

  const abrirModal = () => {
    setErroCriacao(null)
    setEquipe('')
    setDataPrevista('')
    setModalAberto(true)
  }

  const mudarPagina = (novaPagina: number) => {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        if (novaPagina > 1) proximo.set('page', String(novaPagina))
        else proximo.delete('page')
        return proximo
      },
      { replace: true },
    )
  }

  const mudarFiltroSemOrdem = (marcado: boolean) => {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        if (marcado) proximo.set('sem_ordem_ativa', 'true')
        else proximo.delete('sem_ordem_ativa')
        proximo.delete('page')
        return proximo
      },
      { replace: true },
    )
  }

  const exportarFila = async () => {
    if (!dados || dados.total === 0 || exportando || atualizando) return

    setExportando(true)
    try {
      const pageSize = 200
      const primeiraPagina = await buscarCandidatos({
        periodo_atual: periodoAtual,
        municipio,
        bairro,
        classe,
        alimentador,
        sem_ordem_ativa: semOrdemAtiva,
        page: 1,
        page_size: pageSize,
      })
      const exportados = [...primeiraPagina.items]
      const totalPaginas = Math.ceil(primeiraPagina.total / pageSize)

      for (let pagina = 2; pagina <= totalPaginas; pagina += 1) {
        const resposta = await buscarCandidatos({
          periodo_atual: periodoAtual,
          municipio,
          bairro,
          classe,
          alimentador,
          sem_ordem_ativa: semOrdemAtiva,
          page: pagina,
          page_size: pageSize,
        })
        if (resposta.total !== primeiraPagina.total) {
          throw new Error('A fila mudou durante a exportação. Tente novamente.')
        }
        exportados.push(...resposta.items)
      }

      if (
        exportados.length !== primeiraPagina.total ||
        new Set(exportados.map((candidato) => candidato.id_uc)).size !== exportados.length
      ) {
        throw new Error('Não foi possível carregar todos os candidatos. Tente exportar novamente.')
      }

      const conteudo = gerarCsvCandidatos(exportados)
      const arquivo = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(arquivo)
      const link = document.createElement('a')
      link.href = url
      link.download = primeiraPagina.metadados.dados_ficticios
        ? 'fila-inspecao-mock.csv'
        : 'fila-inspecao.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)

      const origem = primeiraPagina.metadados.dados_ficticios ? 'Dados fictícios: ' : ''
      setToast({
        tipo: 'sucesso',
        texto: `${origem}${exportados.length} ${
          exportados.length === 1 ? 'candidato exportado' : 'candidatos exportados'
        }`,
      })
    } catch (erro: unknown) {
      setToast({ tipo: 'erro', texto: normalizarErro(erro).mensagem })
    } finally {
      setExportando(false)
    }
  }

  const fecharModal = () => {
    if (criando) return
    setModalAberto(false)
  }

  const gerarOrdens = async () => {
    if (quantidadeSelecionada === 0 || criando) return
    if (!equipe.trim()) {
      setErroCriacao('Informe a equipe responsável.')
      return
    }

    setCriando(true)
    setErroCriacao(null)

    try {
      // Um lote, tudo ou nada. Cada ordem nasce com o contexto da Gold: motivos e kWh estimado da fila.
      const resposta = await criarInspecoesEmLote(
        Object.values(selecionadas).map((candidato) => ({
          id_uc: candidato.id_uc,
          equipe_responsavel: equipe.trim(),
          data_prevista: dataPrevista || null,
          motivo: candidato.motivos.join(' · ') || null,
          kwh_estimado: candidato.energia_estimada.valor ?? null,
        })),
      )
      setCriadas(resposta.items)
      setToast({
        tipo: 'sucesso',
        texto:
          resposta.total === 1
            ? 'Ordem de inspeção criada.'
            : `${resposta.total} ordens de inspeção criadas.`,
      })
      limparSelecao()
      setModalAberto(false)
      // Permanece na fila: a confirmação acima aponta para a ordem recém-criada.
      candidatos.recarregar()
    } catch (erro: unknown) {
      const falhas = falhasDoLote(erro)
      const mensagem =
        falhas.length > 0
          ? `Nenhuma ordem foi criada. Revise: ${falhas
              .map((falha) => `${falha.id_uc} (${falha.mensagem})`)
              .join('; ')}`
          : normalizarErro(erro).mensagem
      setErroCriacao(mensagem)
      setToast({ tipo: 'erro', texto: mensagem })
      // Outra pessoa pode ter criado ordem para uma UC da seleção: atualiza os bloqueios da fila.
      candidatos.recarregar()
    } finally {
      setCriando(false)
    }
  }

  const carregandoInicial = candidatos.carregando && dados === null
  const atualizando = candidatos.carregando && dados !== null
  const tabelarows = dados?.items ?? []

  const resumoCards = dados && [
    {
      label: 'UCs analisadas',
      value: Number(dados.resumo.ucs_analisadas.valor ?? 0).toLocaleString('pt-BR'),
    },
    {
      label: 'Priorizadas',
      value: Number(dados.resumo.ucs_priorizadas.valor ?? 0).toLocaleString('pt-BR'),
    },
    {
      label: 'Potencial de recuperação',
      value: formatarEnergia(Number(dados.resumo.potencial_recuperacao.valor ?? 0)),
    },
    {
      label: 'Ordens em andamento',
      value: Number(dados.resumo.ordens_ativas.valor ?? 0).toLocaleString('pt-BR'),
    },
  ]

  return (
    <Pagina
      titulo="Fila de perdas"
      subtitulo="UCs elegíveis, motivos da suspeita e ação recomendada"
    >
      <BarraDeFiltros campos={CAMPOS} padroes={PADROES} opcoes={opcoesFiltros.opcoes} />

      {opcoesFiltros.erro && (
        <Aviso variante="alerta">
          Não foi possível carregar as opções de filtro da Gold. A fila continua disponível, mas os
          filtros de região ficam sem valores.
        </Aviso>
      )}

      {toast && (
        <Aviso variante={toast.tipo === 'sucesso' ? 'sucesso' : 'perigo'} anunciar>
          {toast.texto}
        </Aviso>
      )}

      {criadas && criadas.length > 0 && (
        <Aviso
          variante="sucesso"
          titulo={
            criadas.length === 1
              ? `Ordem criada para a UC ${criadas[0].id_uc}`
              : `${criadas.length} ordens de inspeção criadas`
          }
          acao={
            criadas.length === 1 ? (
              <Link
                to={`/perdas/ordens?destaque=${criadas[0].id_ordem}`}
                className="inline-flex h-9 items-center rounded-md bg-azul-300 px-3 text-corpo font-semibold text-sobre-acao hover:bg-azul-400"
              >
                Ver ordem
              </Link>
            ) : (
              <Link
                to={`/perdas/ordens?destaque=${criadas.map((o) => o.id_ordem).join(',')}`}
                className="inline-flex h-9 items-center rounded-md bg-azul-300 px-3 text-corpo font-semibold text-sobre-acao hover:bg-azul-400"
              >
                Ver ordens
              </Link>
            )
          }
        >
          {criadas.length === 1 ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>A ordem #{criadas[0].id_ordem} está na fila de ordens de inspeção.</span>
              <button
                type="button"
                onClick={() => setCriadas(null)}
                className="text-legenda font-medium underline underline-offset-2"
              >
                Dispensar
              </button>
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <p>Cada UC selecionada recebeu uma ordem. Abra a lista para acompanhar:</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-legenda">
                {criadas.map((ordem) => (
                  <li key={ordem.id_ordem}>
                    <Link
                      to={`/perdas/ordens?destaque=${ordem.id_ordem}`}
                      className="font-medium underline underline-offset-2"
                    >
                      #{ordem.id_ordem} · {ordem.id_uc}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Aviso>
      )}

      {candidatos.erro && !dados ? (
        <ErrorState
          erro={candidatos.erro}
          titulo="Não foi possível carregar a fila"
          aoTentarNovamente={candidatos.recarregar}
          className="rounded-card border border-borda bg-surface-card shadow-card"
        />
      ) : dados ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {resumoCards?.map((card, i) => (
              <div
                key={card.label}
                className={`rounded-card border p-4 shadow-card ${
                  i === 2 ? 'border-teal/30 bg-azul-50' : 'border-borda bg-surface-card'
                }`}
              >
                <p className="text-legenda font-semibold tracking-wide text-ink-2 uppercase">
                  {card.label}
                </p>
                <p
                  className={`mt-1.5 text-numero font-semibold tracking-tight ${
                    i === 2 ? 'text-teal-profundo' : 'text-ink'
                  }`}
                >
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <section
            aria-label="Ranking priorizado de UCs"
            className="overflow-hidden rounded-card border border-borda bg-surface-card shadow-card"
          >
            <div className="flex flex-col gap-3 border-b border-borda-leve p-4 md:flex-row md:items-start md:justify-between md:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-titulo-lg font-medium">Ranking priorizado</h2>
                  <SeloFicticio metadados={dados.metadados} />
                </div>
                <p className="mt-1 max-w-2xl text-legenda leading-5 text-ink-2">
                  O score combina potencial de recuperação, anomalias e histórico de inspeção. Não é
                  probabilidade de fraude; o kWh é uma estimativa, não energia comprovada.
                </p>
                {dados.metadados.gold_atualizada_em && (
                  <p className="mt-1 text-legenda text-ink-3">
                    Gold atualizada em {formatarAtualizacao(dados.metadados.gold_atualizada_em)}
                  </p>
                )}
                {atualizando && (
                  <p role="status" className="mt-1 text-legenda text-teal-profundo">
                    Atualizando resultados…
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-9 items-center gap-2 whitespace-nowrap rounded-md border border-borda bg-surface-card px-3 text-legenda font-medium text-ink-2">
                  <input
                    type="checkbox"
                    checked={semOrdemAtiva}
                    onChange={(evento) => mudarFiltroSemOrdem(evento.target.checked)}
                    aria-label="Ocultar UCs com ordem ativa"
                    className="size-4 rounded-sm accent-teal-escuro"
                  />
                  Ocultar UCs com ordem ativa
                </label>
                <Button
                  variante="secundario"
                  icone={<Download size={17} aria-hidden="true" />}
                  onClick={exportarFila}
                  carregando={exportando}
                  disabled={dados.total === 0 || atualizando}
                  motivoDesabilitado={
                    dados.total === 0
                      ? 'Não há UCs para exportar neste recorte.'
                      : 'Aguarde a atualização da fila.'
                  }
                >
                  Exportar CSV
                </Button>
              </div>
            </div>

            {carregandoInicial ? (
              <div className="flex flex-col gap-2 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : tabelarows.length === 0 ? (
              <EmptyState
                titulo="Nenhuma UC respeita os filtros"
                descricao="Nenhuma unidade consumidora foi encontrada para o critério informado. Ajuste os filtros e tente novamente."
                icone={<Search size={28} strokeWidth={1.5} />}
                acao={
                  <Button variante="secundario" tamanho="sm" onClick={limpar}>
                    Limpar filtros
                  </Button>
                }
                className="min-h-[260px]"
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table
                    aria-busy={atualizando}
                    className={`w-full min-w-[1320px] border-collapse text-left text-legenda ${
                      atualizando ? 'opacity-60' : ''
                    }`}
                  >
                    <caption className="sr-only">
                      Ranking de unidades consumidoras priorizadas para inspeção
                    </caption>
                    <colgroup>
                      <col className="w-12" />
                      <col className="w-[120px]" />
                      <col className="w-[140px]" />
                      <col className="w-[150px]" />
                      <col className="w-[110px]" />
                      <col className="w-[112px]" />
                      <col />
                      <col className="w-[112px]" />
                      <col className="w-[104px]" />
                      <col className="w-[132px]" />
                      <col className="w-[190px]" />
                    </colgroup>
                    <thead className="bg-surface-alt text-ink-2">
                      <tr>
                        <th scope="col" className="px-2 py-3 text-center">
                          #
                        </th>
                        <th scope="col" className="px-3 py-3">
                          UC
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Ação recomendada
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Localização
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Classe
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Alimentador
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Motivos da suspeita
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Confiança
                        </th>
                        <th scope="col" className="px-3 py-3 text-right">
                          kWh estimado
                        </th>
                        <th scope="col" className="px-3 py-3 text-center">
                          Prioridade
                        </th>
                        <th scope="col" className="px-3 py-3 text-center">
                          Seleção
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabelarows.map((linha) => {
                        const selecionado = Boolean(selecionadas[linha.id_uc])
                        const podeSelecionar =
                          !linha.ordem_ativa && linha.acao_recomendada === 'INSPECAO_PRIORITARIA'
                        return (
                          <tr
                            key={linha.id_uc}
                            className={`border-b border-borda-leve transition-colors last:border-b-0 ${
                              selecionado ? 'bg-lima-suave' : 'hover:bg-surface-sutil'
                            }`}
                          >
                            <td className="px-2 py-3 text-center text-ink-3">{linha.posicao}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col">
                                <span className="font-semibold text-ink">{linha.id_uc}</span>
                                {linha.ordem_ativa && (
                                  <span className="text-micro text-ink-2">Ordem em andamento</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <Badge variante={ACAO_RECOMENDADA[linha.acao_recomendada].variante}>
                                {ACAO_RECOMENDADA[linha.acao_recomendada].rotulo}
                              </Badge>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col">
                                <span className="font-medium text-ink">
                                  {formatarNome(linha.municipio)}
                                </span>
                                <span className="text-micro text-ink-2">
                                  {formatarNome(linha.bairro)}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-ink-2">{formatarNome(linha.classe)}</td>
                            <td className="px-3 py-3 font-medium text-ink-2">
                              {linha.alimentador}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {formatarMotivos(linha.motivos)}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <Badge variante={CONFIANCA[linha.confianca_evidencia].variante} ponto>
                                {CONFIANCA[linha.confianca_evidencia].rotulo}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 text-right font-medium tabular-nums text-ink">
                              {formatarEnergia(Number(linha.energia_estimada.valor ?? 0))}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <span className="font-semibold text-ink">
                                  {linha.score.toFixed(1)}
                                </span>
                                <div className="h-2 w-16 overflow-hidden rounded-full bg-surface-alt">
                                  <div
                                    className="h-full rounded-full bg-teal"
                                    style={{
                                      width: `${Math.min(100, Number(linha.score ?? 0))}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              {linha.ordem_ativa ? (
                                <span className="inline-flex items-center gap-1.5 text-legenda text-ink-2">
                                  <LockKeyhole size={14} aria-hidden="true" />
                                  Em andamento
                                </span>
                              ) : !podeSelecionar ? (
                                <Button
                                  variante="secundario"
                                  tamanho="sm"
                                  disabled
                                  aria-label={`Selecionar para inspeção ${linha.id_uc}`}
                                  motivoDesabilitado="Esta UC pede validação documental antes de uma ordem de campo."
                                  className="w-full"
                                >
                                  Selecionar
                                </Button>
                              ) : (
                                <Button
                                  variante={selecionado ? 'primario' : 'secundario'}
                                  tamanho="sm"
                                  aria-label={
                                    selecionado
                                      ? `Remover seleção de ${linha.id_uc}`
                                      : `Selecionar para inspeção ${linha.id_uc}`
                                  }
                                  aria-pressed={selecionado}
                                  onClick={() => alternarSelecao(linha)}
                                  disabled={atualizando}
                                  motivoDesabilitado="Aguarde a atualização da fila."
                                  icone={
                                    selecionado ? (
                                      <Check size={14} aria-hidden="true" />
                                    ) : (
                                      <Plus size={14} aria-hidden="true" />
                                    )
                                  }
                                  className="w-full"
                                >
                                  {selecionado ? 'Selecionada' : 'Selecionar para inspeção'}
                                </Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="sticky bottom-0 z-10 border-t border-borda bg-surface-card/95 backdrop-blur">
                  {quantidadeSelecionada > 0 ? (
                    <div
                      role="region"
                      aria-label="Seleção para inspeção"
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <p className="text-corpo text-ink" aria-live="polite">
                        <strong className="font-semibold">{quantidadeSelecionada}</strong>{' '}
                        {quantidadeSelecionada === 1
                          ? 'UC selecionada para inspeção'
                          : 'UCs selecionadas para inspeção'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variante="fantasma"
                          tamanho="sm"
                          onClick={limparSelecao}
                          icone={<X size={14} aria-hidden="true" />}
                        >
                          Limpar seleção
                        </Button>
                        <Button
                          tamanho="sm"
                          onClick={abrirModal}
                          disabled={atualizando}
                          motivoDesabilitado="Aguarde a atualização da fila."
                          icone={<ClipboardPlus size={16} aria-hidden="true" />}
                        >
                          Gerar ordem de inspeção
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="px-5 py-3 text-legenda text-ink-2">
                      Use “Selecionar para inspeção” em cada UC para montar o lote. UCs com ordem em
                      andamento ou validação documental não entram no lote.
                    </p>
                  )}
                </div>

                {dados.total > LINHAS_POR_PAGINA && (
                  <div className="border-t border-borda-leve p-4">
                    <Paginacao
                      page={page}
                      pageSize={LINHAS_POR_PAGINA}
                      total={dados.total}
                      aoMudar={mudarPagina}
                    />
                  </div>
                )}
              </>
            )}
          </section>
        </>
      ) : null}

      <Modal
        aberto={modalAberto}
        aoFechar={fecharModal}
        titulo="Gerar ordem de inspeção"
        descricao={
          quantidadeSelecionada === 1
            ? 'Será gerada 1 ordem de inspeção para a UC selecionada.'
            : `Serão geradas ${quantidadeSelecionada} ordens de inspeção para as UCs selecionadas.`
        }
        tamanho="md"
        fecharAoClicarFora={!criando}
        rodape={
          <>
            <Button variante="secundario" onClick={fecharModal} disabled={criando}>
              Cancelar
            </Button>
            <Button onClick={gerarOrdens} carregando={criando}>
              Gerar {quantidadeSelecionada === 1 ? 'ordem' : 'ordens'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-corpo font-medium text-ink">UCs selecionadas</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(selecionadas).map((idUc) => (
                <span
                  key={idUc}
                  className="rounded-full border border-borda bg-surface-alt px-2.5 py-1 text-legenda text-ink"
                >
                  {idUc}
                </span>
              ))}
            </div>
          </div>

          <Input
            rotulo="Equipe responsável"
            value={equipe}
            onChange={(e) => setEquipe(e.target.value)}
            placeholder="Ex.: Equipe Norte 02"
            ajuda="Campo obrigatório: identifica a equipe que fará a vistoria."
            required
          />

          <Input
            rotulo="Data prevista"
            type="date"
            value={dataPrevista}
            onChange={(e) => setDataPrevista(e.target.value)}
            ajuda="Opcional. Pode ser ajustada depois, no despacho para campo."
          />

          <p className="text-legenda leading-5 text-ink-2">
            O motivo e o kWh estimado de cada UC serão copiados da fila da Gold para a ordem. A API
            bloqueia UCs com validação documental pendente.
          </p>

          {erroCriacao && (
            <Aviso variante="perigo">
              <span className="flex items-start gap-2">
                <ShieldAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                {erroCriacao}
              </span>
            </Aviso>
          )}
        </div>
      </Modal>
    </Pagina>
  )
}
