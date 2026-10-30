import { ClipboardPlus, Download, LockKeyhole, Search, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import Badge, { type VarianteBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Modal from '@/components/ui/Modal'
import Paginacao from '@/components/ui/Paginacao'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { useConsulta } from '@/hooks/useConsulta'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import Pagina from '@/layouts/Pagina'
import { buscarCandidatos, criarInspecao, normalizarErro } from '@/services'
import type { Candidato, ConfiancaEvidencia } from '@/types/inspecoes'
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
const LINHAS_POR_PAGINA = 50
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
      className="inline-flex rounded-full bg-azul-50 px-2.5 py-0.5 text-[10px] font-medium text-teal-profundo"
    >
      {motivo}
    </span>
  ))
}

export default function FilaPage() {
  const opcoesFiltros = useOpcoesFiltros()
  const navigate = useNavigate()
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
    const timer = window.setTimeout(() => setToast(null), 3000)
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
      // Cada ordem nasce com o contexto da Gold: motivos da fila e kWh estimado do candidato.
      for (const candidato of Object.values(selecionadas)) {
        await criarInspecao({
          id_uc: candidato.id_uc,
          equipe_responsavel: equipe.trim(),
          data_prevista: dataPrevista || null,
          motivo: candidato.motivos.join(' · ') || null,
          kwh_estimado: candidato.energia_estimada.valor ?? null,
        })
      }
      setToast({ tipo: 'sucesso', texto: `${quantidadeSelecionada} ordens geradas` })
      setSelecao({ chave: chaveRecorte, itens: {} })
      setModalAberto(false)
      navigate('/perdas/ordens')
    } catch (erro: unknown) {
      const mensagem = normalizarErro(erro).mensagem
      setErroCriacao(mensagem)
      setToast({ tipo: 'erro', texto: mensagem })
      // Uma criação anterior no lote pode ter sido gravada: recarrega os bloqueios da fila.
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
    <Pagina titulo="Fila de perdas" subtitulo="UCs elegíveis e ação recomendada">
      <div className="relative">
        {toast && (
          <div
            aria-live="polite"
            className={[
              'absolute right-0 top-0 z-20 flex items-center gap-3 rounded-full border px-4 py-2 text-sm shadow-lg',
              toast.tipo === 'sucesso'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800',
            ].join(' ')}
          >
            <span className="inline-flex size-2 rounded-full bg-current" aria-hidden="true" />
            {toast.texto}
          </div>
        )}

        <div className="overflow-hidden rounded-[18px] border border-[#dfeaf0] bg-[#edf3f5] shadow-card">
          <BarraDeFiltros
            campos={CAMPOS}
            padroes={PADROES}
            opcoes={opcoesFiltros.opcoes}
            mostrarLimparSempre
            className="rounded-none border-b border-[#dfeaf0] bg-[#edf3f5] p-4 shadow-none"
          />

          {opcoesFiltros.erro && (
            <p
              role="status"
              className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-[12px] text-amber-900"
            >
              Não foi possível carregar as opções de filtro da Gold. A fila continua disponível, mas
              os filtros de região ficam sem valores.
            </p>
          )}

          {candidatos.erro && !dados ? (
            <ErrorState
              erro={candidatos.erro}
              titulo="Não foi possível carregar a fila"
              aoTentarNovamente={candidatos.recarregar}
              className="min-h-[320px] bg-white/50"
            />
          ) : dados ? (
            <>
              <div className="mt-4 mb-4 grid grid-cols-4 gap-0 overflow-hidden rounded-[16px] bg-[#36465f] text-white">
                {resumoCards?.map((card) => (
                  <div
                    key={card.label}
                    className="border-r border-white/10 px-5 py-4 last:border-r-0"
                  >
                    <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-blue-100/70">
                      {card.label}
                    </p>
                    <p className="mt-2 text-[18px] font-semibold text-white">{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-[#f4f6f7] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[20px] font-medium text-[#2e2e2e]">Ranking priorizado</h2>
                      <SeloFicticio metadados={dados.metadados} />
                    </div>
                    <p className="text-[12px] text-[#68737b]">
                      Score combina potencial de recuperação, anomalias e histórico de inspeção. Não
                      é probabilidade de fraude; o kWh é uma estimativa, não energia comprovada.
                    </p>
                    {dados.metadados.gold_atualizada_em && (
                      <p className="text-[12px] text-[#68737b]">
                        Gold atualizada em {formatarAtualizacao(dados.metadados.gold_atualizada_em)}
                      </p>
                    )}
                    {atualizando && (
                      <p role="status" className="mt-1 text-[12px] text-teal-profundo">
                        Atualizando resultados…
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {quantidadeSelecionada > 0 && (
                      <span className="text-[12px] font-medium text-teal-profundo">
                        {quantidadeSelecionada}{' '}
                        {quantidadeSelecionada === 1 ? 'selecionada' : 'selecionadas'}
                      </span>
                    )}
                    <Button
                      variante="secundario"
                      icone={<Download size={18} aria-hidden="true" />}
                      onClick={exportarFila}
                      carregando={exportando}
                      disabled={dados.total === 0 || atualizando}
                    >
                      Exportar CSV
                    </Button>
                    <label className="flex items-center gap-2 whitespace-nowrap text-[12px] text-[#48555d]">
                      <input
                        type="checkbox"
                        checked={semOrdemAtiva}
                        onChange={(evento) => mudarFiltroSemOrdem(evento.target.checked)}
                        aria-label="Ocultar UCs com ordem ativa"
                        className="h-4 w-4 rounded border-[#c5d0d8] accent-[#2d6a80]"
                      />
                      Ocultar UCs com ordem ativa
                    </label>
                    <Button
                      icone={<ClipboardPlus size={18} aria-hidden="true" />}
                      onClick={abrirModal}
                      disabled={quantidadeSelecionada === 0 || atualizando}
                    >
                      Gerar ordem de inspeção
                    </Button>
                  </div>
                </div>

                {carregandoInicial ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-lg" />
                    ))}
                  </div>
                ) : tabelarows.length === 0 ? (
                  <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-[#dfeaf0] bg-white/50">
                    <EmptyState
                      titulo="Nenhuma UC respeita os filtros"
                      descricao="Nenhuma unidade consumidora foi encontrada para o critério informado. Ajuste os filtros e tente novamente."
                      icone={<Search size={28} strokeWidth={1.5} />}
                      acao={
                        <Button variante="secundario" tamanho="sm" onClick={limpar}>
                          Limpar filtros
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[#dfeaf0] bg-white">
                    <div className="overflow-x-auto">
                      <table
                        aria-busy={atualizando}
                        className={`w-full min-w-[1220px] table-fixed border-collapse text-left text-[12px] ${atualizando ? 'opacity-60' : ''}`}
                      >
                        <colgroup>
                          <col className="w-10" />
                          <col className="w-10" />
                          <col className="w-[108px]" />
                          <col className="w-[146px]" />
                          <col className="w-[112px]" />
                          <col className="w-[88px]" />
                          <col className="w-[118px]" />
                          <col />
                          <col className="w-[104px]" />
                          <col className="w-[108px]" />
                          <col className="w-[132px]" />
                        </colgroup>
                        <thead className="bg-[#2d425a] text-white">
                          <tr>
                            <th className="px-2 py-3 text-center" aria-label="Seleção" />
                            <th className="px-2 py-3 text-center">#</th>
                            <th className="px-3 py-3">UC</th>
                            <th className="px-3 py-3">Ação recomendada</th>
                            <th className="px-3 py-3">Localização</th>
                            <th className="px-3 py-3">Classe</th>
                            <th className="px-3 py-3">Alimentador</th>
                            <th className="px-3 py-3">Motivos da suspeita</th>
                            <th className="px-3 py-3">Confiança</th>
                            <th className="px-3 py-3 text-right">kWh estimado</th>
                            <th className="px-3 py-3 text-center">Prioridade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tabelarows.map((linha, index) => (
                            <tr
                              key={linha.id_uc}
                              className={index % 2 === 0 ? 'bg-white' : 'bg-[#f3f7f9]'}
                            >
                              <td className="border-b border-[#edf2f5] px-3 py-3 text-center">
                                {linha.ordem_ativa ? (
                                  <LockKeyhole
                                    size={14}
                                    className="mx-auto text-[#9aa3a9]"
                                    aria-label="Ordem em andamento"
                                  />
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={Boolean(selecionadas[linha.id_uc])}
                                    disabled={
                                      atualizando ||
                                      linha.acao_recomendada !== 'INSPECAO_PRIORITARIA'
                                    }
                                    aria-label={`Selecionar ${linha.id_uc}`}
                                    onChange={() => alternarSelecao(linha)}
                                    className="h-4 w-4 rounded border-[#c5d0d8] text-[#2d6a80] accent-[#2d6a80]"
                                  />
                                )}
                              </td>
                              <td className="border-b border-[#edf2f5] px-2 py-3 text-center text-[#59656d]">
                                {linha.posicao}
                              </td>
                              <td className="border-b border-[#edf2f5] px-3 py-3">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-[#2c2d2d]">
                                    {linha.id_uc}
                                  </span>
                                  {linha.ordem_ativa && (
                                    <span className="text-[10px] text-[#6f7c84]">
                                      Ordem em andamento
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="border-b border-[#edf2f5] px-3 py-3">
                                <Badge variante={ACAO_RECOMENDADA[linha.acao_recomendada].variante}>
                                  {ACAO_RECOMENDADA[linha.acao_recomendada].rotulo}
                                </Badge>
                              </td>
                              <td className="border-b border-[#edf2f5] px-3 py-3">
                                <div className="flex flex-col">
                                  <span className="font-medium text-[#2c2d2d]">
                                    {formatarNome(linha.municipio)}
                                  </span>
                                  <span className="text-[10px] text-[#7d858d]">
                                    {formatarNome(linha.bairro)}
                                  </span>
                                </div>
                              </td>
                              <td className="border-b border-[#edf2f5] px-3 py-3 text-[#4b5156]">
                                {formatarNome(linha.classe)}
                              </td>
                              <td className="border-b border-[#edf2f5] px-3 py-3 font-medium text-[#4b5156]">
                                {linha.alimentador}
                              </td>
                              <td className="border-b border-[#edf2f5] px-3 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {formatarMotivos(linha.motivos)}
                                </div>
                              </td>
                              <td className="border-b border-[#edf2f5] px-3 py-3">
                                <Badge
                                  variante={CONFIANCA[linha.confianca_evidencia].variante}
                                  ponto
                                >
                                  {CONFIANCA[linha.confianca_evidencia].rotulo}
                                </Badge>
                              </td>
                              <td className="border-b border-[#edf2f5] px-2 py-3 text-center font-medium tabular-nums text-[#2d425a]">
                                {formatarEnergia(Number(linha.energia_estimada.valor ?? 0))}
                              </td>
                              <td className="border-b border-[#edf2f5] px-2 py-3">
                                <div className="flex items-center justify-center gap-2">
                                  <span className="text-[#2d425a] font-semibold">
                                    {linha.score.toFixed(1)}
                                  </span>
                                  <div className="h-2 w-20 overflow-hidden rounded-full bg-[#dfeaf0]">
                                    <div
                                      className="h-full rounded-full bg-[#7bbfd0]"
                                      style={{
                                        width: `${Math.min(100, Number(linha.score ?? 0))}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {dados.total > LINHAS_POR_PAGINA && (
                      <div className="border-t border-[#dfeaf0] bg-white p-4">
                        <Paginacao
                          page={page}
                          pageSize={LINHAS_POR_PAGINA}
                          total={dados.total}
                          aoMudar={mudarPagina}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Modal
        aberto={modalAberto}
        aoFechar={fecharModal}
        titulo="Gerar ordem de inspeção"
        descricao={`Serão geradas ${quantidadeSelecionada} ordem(ns) de inspeção para as UCs selecionadas.`}
        tamanho="md"
        fecharAoClicarFora={!criando}
        rodape={
          <>
            <Button variante="secundario" onClick={fecharModal} disabled={criando}>
              Cancelar
            </Button>
            <Button onClick={gerarOrdens} carregando={criando}>
              Gerar ordens
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-[#2d425a]">UCs selecionadas</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(selecionadas).map((idUc) => (
                <span
                  key={idUc}
                  className="rounded-full bg-[#eef3f6] px-2.5 py-1 text-[11px] text-[#3b3f42]"
                >
                  {idUc}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="equipe" className="text-sm font-medium text-[#2d425a]">
              Equipe responsável *
            </label>
            <input
              id="equipe"
              value={equipe}
              onChange={(e) => setEquipe(e.target.value)}
              placeholder="Ex.: Equipe Norte 02"
              className="h-10 rounded-md border border-[#cfd9e0] bg-white px-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="data-prevista" className="text-sm font-medium text-[#2d425a]">
              Data prevista
            </label>
            <input
              id="data-prevista"
              type="date"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
              className="h-10 rounded-md border border-[#cfd9e0] bg-white px-3 text-sm text-[#242b32] outline-none focus:border-[#6aa5b4]"
            />
          </div>

          <p className="text-[11px] text-[#68737b]">
            O motivo e o kWh estimado de cada UC serão copiados da fila da Gold para a ordem. A API
            bloqueia UCs com validação documental pendente.
          </p>

          {erroCriacao && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <ShieldAlert size={16} aria-hidden="true" />
              {erroCriacao}
            </div>
          )}
        </div>
      </Modal>
    </Pagina>
  )
}
