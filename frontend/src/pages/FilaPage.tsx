import { ClipboardPlus, Download, LockKeyhole, Search, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Modal from '@/components/ui/Modal'
import Skeleton from '@/components/ui/Skeleton'
import { useConsulta } from '@/hooks/useConsulta'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import Pagina from '@/layouts/Pagina'
import { buscarCandidatos, criarInspecao, normalizarErro } from '@/services'
import type { Candidato } from '@/types/inspecoes'
import type { CampoFiltro, FiltrosUrl } from '@/types/filtros'
import { formatarEnergia, formatarNome } from '@/utils/formatacao'
import { gerarCsvCandidatos } from '@/utils/exportarCandidatos'
import { PERIODO_ATUAL_PADRAO } from '@/utils/periodos'

const CAMPOS: readonly CampoFiltro[] = ['periodo_atual', 'municipio', 'bairro', 'classe']
const PADROES: FiltrosUrl = {
  periodo_atual: PERIODO_ATUAL_PADRAO,
}
const LINHAS_POR_PAGINA = 20

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
  const periodoAtual = filtros.periodo_atual ?? PERIODO_ATUAL_PADRAO
  const { municipio, bairro, classe } = filtros

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
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
          page: 1,
          page_size: LINHAS_POR_PAGINA,
        },
        sinal,
      ),
    [periodoAtual, municipio, bairro, classe],
  )

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const dados = candidatos.dados
  const alternarSelecao = (candidato: Candidato) => {
    if (candidato.ordem_ativa) return
    setSelecionadas((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(candidato.id_uc)) proximo.delete(candidato.id_uc)
      else proximo.add(candidato.id_uc)
      return proximo
    })
  }

  const abrirModal = () => {
    setErroCriacao(null)
    setEquipe('')
    setDataPrevista('')
    setModalAberto(true)
  }

  const exportarFila = async () => {
    if (!dados || dados.total === 0 || exportando || atualizando) return

    setExportando(true)
    try {
      const pageSize = 100
      const primeiraPagina = await buscarCandidatos({
        periodo_atual: periodoAtual,
        municipio,
        bairro,
        classe,
        page: 1,
        page_size: pageSize,
      })
      const candidatos = [...primeiraPagina.items]
      const totalPaginas = Math.ceil(primeiraPagina.total / pageSize)

      for (let page = 2; page <= totalPaginas; page += 1) {
        const resposta = await buscarCandidatos({
          periodo_atual: periodoAtual,
          municipio,
          bairro,
          classe,
          page,
          page_size: pageSize,
        })
        if (resposta.total !== primeiraPagina.total) {
          throw new Error('A fila mudou durante a exportação. Tente novamente.')
        }
        candidatos.push(...resposta.items)
      }

      if (
        candidatos.length !== primeiraPagina.total ||
        new Set(candidatos.map((candidato) => candidato.id_uc)).size !== candidatos.length
      ) {
        throw new Error('Não foi possível carregar todos os candidatos. Tente exportar novamente.')
      }

      const conteudo = gerarCsvCandidatos(candidatos)
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
        texto: `${origem}${candidatos.length} ${candidatos.length === 1 ? 'candidato exportado' : 'candidatos exportados'}`,
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
    if (selecionadas.size === 0 || criando) return
    if (!equipe.trim()) {
      setErroCriacao('Informe a equipe responsável.')
      return
    }

    setCriando(true)
    setErroCriacao(null)

    try {
      for (const idUc of Array.from(selecionadas)) {
        await criarInspecao({
          id_uc: idUc,
          equipe_responsavel: equipe.trim(),
          data_prevista: dataPrevista || null,
        })
      }
      setToast({ tipo: 'sucesso', texto: `${selecionadas.size} ordens geradas` })
      setSelecionadas(new Set())
      setModalAberto(false)
      navigate('/perdas/ordens')
    } catch (erro: unknown) {
      const mensagem = normalizarErro(erro).mensagem
      setErroCriacao(mensagem)
      setToast({ tipo: 'erro', texto: mensagem })
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
    <Pagina titulo="Fila de inspeção priorizada" subtitulo="UCs com maior potencial de recuperação">
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
            opcoes={opcoesFiltros}
            mostrarLimparSempre
            className="rounded-none border-b border-[#dfeaf0] bg-[#edf3f5] p-4 shadow-none"
          />

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
                    <h2 className="text-[20px] font-medium text-[#2e2e2e]">Ranking priorizado</h2>
                    <p className="text-[12px] text-[#68737b]">
                      Score combina potencial de recuperação, anomalias e histórico de inspeção
                    </p>
                    {atualizando && (
                      <p role="status" className="mt-1 text-[12px] text-teal-profundo">
                        Atualizando resultados…
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {selecionadas.size > 0 && (
                      <span className="text-[12px] font-medium text-teal-profundo">
                        {selecionadas.size}{' '}
                        {selecionadas.size === 1 ? 'selecionada' : 'selecionadas'}
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
                    <Button
                      icone={<ClipboardPlus size={18} aria-hidden="true" />}
                      onClick={abrirModal}
                      disabled={selecionadas.size === 0 || atualizando}
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
                      descricao="Nenhuma unidade consumidoras foi encontrada para o critério informado. Ajuste os filtros e tente novamente."
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
                    <table
                      aria-busy={atualizando}
                      className={`w-full min-w-[980px] table-fixed border-collapse text-left text-[12px] ${atualizando ? 'opacity-60' : ''}`}
                    >
                      <colgroup>
                        <col className="w-10" />
                        <col className="w-10" />
                        <col className="w-[110px]" />
                        <col className="w-[112px]" />
                        <col className="w-[88px]" />
                        <col className="w-[118px]" />
                        <col />
                        <col className="w-[108px]" />
                        <col className="w-[132px]" />
                      </colgroup>
                      <thead className="bg-[#2d425a] text-white">
                        <tr>
                          <th className="px-2 py-3 text-center" aria-label="Seleção" />
                          <th className="px-2 py-3 text-center">#</th>
                          <th className="px-3 py-3">UC</th>
                          <th className="px-3 py-3">Localização</th>
                          <th className="px-3 py-3">Classe</th>
                          <th className="px-3 py-3">Alimentador</th>
                          <th className="px-3 py-3">Motivos da suspeita</th>
                          <th className="px-3 py-3 text-right">kWh estimado</th>
                          <th className="px-3 py-3 text-right">Prioridade</th>
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
                                  checked={selecionadas.has(linha.id_uc)}
                                  disabled={atualizando}
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
                                <span className="font-semibold text-[#2c2d2d]">{linha.id_uc}</span>
                                {linha.ordem_ativa && (
                                  <span className="text-[10px] text-[#6f7c84]">
                                    Ordem em andamento
                                  </span>
                                )}
                              </div>
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
                                    style={{ width: `${Math.min(100, Number(linha.score ?? 0))}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
        descricao={`Serão geradas ${selecionadas.size} ordem(ns) de inspeção para as UCs selecionadas.`}
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
              {Array.from(selecionadas).map((idUc) => (
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
