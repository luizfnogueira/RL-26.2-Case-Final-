import {
  CheckCircle2,
  FileText,
  History,
  MoreHorizontal,
  Search,
  Truck,
  X,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import ModalCancelarOrdem from '@/components/inspecoes/ModalCancelarOrdem'
import ModalConcluirOrdem from '@/components/inspecoes/ModalConcluirOrdem'
import ModalDetalhesOrdem from '@/components/inspecoes/ModalDetalhesOrdem'
import ModalIniciarCampo from '@/components/inspecoes/ModalIniciarCampo'
import ResultadoInspecoes from '@/components/inspecoes/ResultadoInspecoes'
import Aviso from '@/components/ui/Aviso'
import Badge, { type VarianteBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Paginacao from '@/components/ui/Paginacao'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { useConsulta } from '@/hooks/useConsulta'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import Pagina from '@/layouts/Pagina'
import { listarInspecoes } from '@/services'
import type { CampoFiltro, OpcoesFiltros } from '@/types/filtros'
import type { Ordem, StatusOrdem } from '@/types/inspecoes'
import { cx } from '@/utils/cx'
import { formatarAtualizacao } from '@/utils/datas'
import { mesesRecentes } from '@/utils/periodos'

const CAMPOS: readonly CampoFiltro[] = [
  'periodo_atual',
  'municipio',
  'bairro',
  'classe',
  'alimentador',
]
const LINHAS_POR_PAGINA = 10

const STATUS_CONFIG: Record<
  StatusOrdem,
  { label: string; variante: VarianteBadge; ponto: string }
> = {
  ABERTA: { label: 'Aberta', variante: 'info', ponto: 'bg-teal' },
  EM_CAMPO: { label: 'Em campo', variante: 'alerta', ponto: 'bg-alerta' },
  CONCLUIDA: { label: 'Concluída', variante: 'sucesso', ponto: 'bg-sucesso-texto' },
  CANCELADA: { label: 'Cancelada', variante: 'neutro', ponto: 'bg-ink-3' },
}

const ORDEM_STATUS: readonly StatusOrdem[] = ['ABERTA', 'EM_CAMPO', 'CONCLUIDA', 'CANCELADA']

function formatarData(dataStr?: string | null): string {
  if (!dataStr) return '—'
  const d = new Date(dataStr)
  if (Number.isNaN(d.getTime())) return dataStr
  return d.toLocaleDateString('pt-BR')
}

type AcoesOrdemProps = {
  ordem: Ordem
  aoIniciar: (ordem: Ordem) => void
  aoConcluir: (ordem: Ordem) => void
  aoCancelar: (ordem: Ordem) => void
  aoVerDetalhes: (ordem: Ordem) => void
}

/**
 * Ações de uma ordem, num único lugar por linha. A ação que faz o fluxo avançar fica visível;
 * o menu guarda só as secundárias (cancelar e ver detalhes). Cada status mostra apenas o que é
 * válido para ele.
 */
function AcoesOrdem({ ordem, aoIniciar, aoConcluir, aoCancelar, aoVerDetalhes }: AcoesOrdemProps) {
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const idMenu = `acoes-ordem-${ordem.id_ordem}`
  const ativa = ordem.status === 'ABERTA' || ordem.status === 'EM_CAMPO'
  const quantidadeAcoes = ativa ? 2 : 1

  useEffect(() => {
    if (!aberto) return

    const fecharAoClicarFora = (evento: PointerEvent) => {
      const alvo = evento.target as Node
      if (!menuRef.current?.contains(alvo) && !botaoRef.current?.contains(alvo)) {
        setAberto(false)
      }
    }
    const fecharComEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        setAberto(false)
        botaoRef.current?.focus()
      }
    }
    const fecharAoRolar = () => setAberto(false)

    document.addEventListener('pointerdown', fecharAoClicarFora)
    document.addEventListener('keydown', fecharComEscape)
    window.addEventListener('scroll', fecharAoRolar, true)
    return () => {
      document.removeEventListener('pointerdown', fecharAoClicarFora)
      document.removeEventListener('keydown', fecharComEscape)
      window.removeEventListener('scroll', fecharAoRolar, true)
    }
  }, [aberto])

  const executarAcao = (acao: (ordem: Ordem) => void) => {
    setAberto(false)
    acao(ordem)
  }

  const alternarMenu = () => {
    if (aberto) {
      setAberto(false)
      return
    }

    const retangulo = botaoRef.current?.getBoundingClientRect()
    if (retangulo) {
      const alturaMenu = quantidadeAcoes * 38 + 16
      const larguraMenu = 200
      const margem = 8
      const abaixo = retangulo.bottom + margem
      const acima = retangulo.top - alturaMenu - margem
      const abrirAcima = window.innerHeight - abaixo < alturaMenu && acima >= margem
      const top = abrirAcima ? acima : Math.min(abaixo, window.innerHeight - alturaMenu - margem)
      const left = Math.max(
        margem,
        Math.min(
          retangulo.left + retangulo.width / 2 - larguraMenu / 2,
          window.innerWidth - larguraMenu - margem,
        ),
      )
      setPosicao({ top, left })
    }

    setAberto(true)
  }

  // Sem ação secundária, "Ver detalhes" aparece direto: não escondemos uma ação atrás de um menu.
  if (!ativa) {
    return (
      <div
        role="group"
        aria-label={`Ações da ordem #${ordem.id_ordem}`}
        className="flex justify-end"
      >
        <Button
          variante="secundario"
          tamanho="sm"
          onClick={() => aoVerDetalhes(ordem)}
          icone={<History size={14} aria-hidden="true" />}
        >
          Ver detalhes
        </Button>
      </div>
    )
  }

  return (
    <>
      <div
        role="group"
        aria-label={`Ações da ordem #${ordem.id_ordem}`}
        className="flex items-center justify-end gap-1.5"
      >
        {ordem.status === 'ABERTA' && (
          <Button
            tamanho="sm"
            onClick={() => aoIniciar(ordem)}
            icone={<Truck size={15} aria-hidden="true" />}
          >
            Iniciar campo
          </Button>
        )}
        {ordem.status === 'EM_CAMPO' && (
          <Button
            tamanho="sm"
            onClick={() => aoConcluir(ordem)}
            icone={<CheckCircle2 size={15} aria-hidden="true" />}
          >
            Registrar resultado
          </Button>
        )}
        <Button
          ref={botaoRef}
          variante="secundario"
          tamanho="sm"
          aria-label={`Mais ações da ordem #${ordem.id_ordem}`}
          aria-expanded={aberto}
          aria-controls={idMenu}
          title="Mais ações"
          className="size-8 p-0"
          onClick={alternarMenu}
          icone={<MoreHorizontal size={18} aria-hidden="true" />}
        />
      </div>

      {createPortal(
        <div
          ref={menuRef}
          id={idMenu}
          hidden={!aberto}
          style={{ position: 'fixed', top: posicao.top, left: posicao.left }}
          className="z-50 w-50 rounded-md border border-borda bg-surface-card p-1.5 text-left shadow-flutuante"
          role="group"
          aria-label={`Mais ações da ordem #${ordem.id_ordem}`}
        >
          <Button
            variante="fantasma"
            tamanho="sm"
            className="w-full justify-start rounded-sm px-3"
            onClick={() => executarAcao(aoVerDetalhes)}
            icone={<History size={15} aria-hidden="true" />}
          >
            Ver detalhes
          </Button>
          <Button
            variante="perigo-fantasma"
            tamanho="sm"
            className="w-full justify-start rounded-sm px-3"
            onClick={() => executarAcao(aoCancelar)}
            icone={<XCircle size={15} aria-hidden="true" />}
          >
            Cancelar ordem
          </Button>
        </div>,
        document.body,
      )}
    </>
  )
}

export default function OrdensPage() {
  const opcoesFiltros = useOpcoesFiltros()
  const { filtros, limpar } = useFiltrosUrl(CAMPOS)
  const { periodo_atual: periodoAtual, municipio, bairro, classe, alimentador } = filtros
  // Em ordens, `periodo_atual` é o mês de criação, não uma janela analítica da Gold:
  // os atalhos de cenário do dashboard não encontrariam nenhuma ordem criada agora.
  // Um período vindo de link antigo continua visível mesmo fora dos últimos 12 meses.
  const opcoesBarra = useMemo<OpcoesFiltros>(() => {
    const meses = mesesRecentes(12)
    const periodos =
      periodoAtual && !meses.includes(periodoAtual) ? [periodoAtual, ...meses] : meses
    return { ...opcoesFiltros.opcoes, periodos }
  }, [opcoesFiltros.opcoes, periodoAtual])
  const [params, setParams] = useSearchParams()

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)
  const statusFiltro = (params.get('status') as StatusOrdem) || undefined
  const ucFiltro = params.get('id_uc')?.trim() || ''
  const destaqueParam = params.get('destaque') ?? ''
  const destacadas = useMemo(
    () =>
      new Set(
        destaqueParam
          .split(',')
          .map((valor) => Number.parseInt(valor, 10))
          .filter((valor) => Number.isFinite(valor)),
      ),
    [destaqueParam],
  )

  const [buscaUc, setBuscaUc] = useState(ucFiltro)
  const [anteriorUcFiltro, setAnteriorUcFiltro] = useState(ucFiltro)
  if (anteriorUcFiltro !== ucFiltro) {
    setAnteriorUcFiltro(ucFiltro)
    setBuscaUc(ucFiltro)
  }

  const [toast, setToast] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  // Estado dos modais de ação
  const [ordemSelecionada, setOrdemSelecionada] = useState<Ordem | null>(null)
  const [modalIniciarAberto, setModalIniciarAberto] = useState(false)
  const [modalConcluirAberto, setModalConcluirAberto] = useState(false)
  const [modalCancelarAberto, setModalCancelarAberto] = useState(false)
  const [modalDetalhesAberto, setModalDetalhesAberto] = useState(false)

  const ordensConsulta = useConsulta(
    (sinal) =>
      listarInspecoes(
        {
          periodo_atual: periodoAtual,
          municipio,
          bairro,
          classe,
          alimentador,
          status: statusFiltro,
          id_uc: ucFiltro || undefined,
          page,
          page_size: LINHAS_POR_PAGINA,
        },
        sinal,
      ),
    [periodoAtual, municipio, bairro, classe, alimentador, statusFiltro, ucFiltro, page],
  )

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const dados = ordensConsulta.dados
  const carregandoInicial = ordensConsulta.carregando && dados === null
  const atualizando = ordensConsulta.carregando && dados !== null

  const selecionarStatus = (novoStatus?: StatusOrdem) => {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        if (novoStatus) proximo.set('status', novoStatus)
        else proximo.delete('status')
        proximo.delete('page')
        return proximo
      },
      { replace: true },
    )
  }

  const limparDestaque = () =>
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        proximo.delete('destaque')
        return proximo
      },
      { replace: true },
    )

  const handleSubmeterBuscaUc = (e: React.FormEvent) => {
    e.preventDefault()
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        if (buscaUc.trim()) proximo.set('id_uc', buscaUc.trim())
        else proximo.delete('id_uc')
        proximo.delete('page')
        return proximo
      },
      { replace: true },
    )
  }

  const limparBuscaUc = () => {
    setBuscaUc('')
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        proximo.delete('id_uc')
        proximo.delete('page')
        return proximo
      },
      { replace: true },
    )
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

  const handleSucessoAcao = (mensagem: string) => {
    setToast({ tipo: 'sucesso', texto: mensagem })
    ordensConsulta.recarregar()
  }

  const contagem = dados?.contagem_status ?? {
    ABERTA: 0,
    EM_CAMPO: 0,
    CONCLUIDA: 0,
    CANCELADA: 0,
  }
  const totalGeral = contagem.ABERTA + contagem.EM_CAMPO + contagem.CONCLUIDA + contagem.CANCELADA

  const cardsStatus: { status?: StatusOrdem; label: string; total: number; ponto?: string }[] = [
    { label: 'Todas', total: totalGeral },
    ...ORDEM_STATUS.map((status) => ({
      status,
      label: STATUS_CONFIG[status].label,
      total: contagem[status],
      ponto: STATUS_CONFIG[status].ponto,
    })),
  ]

  return (
    <Pagina titulo="Ordens de inspeção" subtitulo="Gestão do ciclo completo da fiscalização">
      <BarraDeFiltros campos={CAMPOS} opcoes={opcoesBarra} />

      {opcoesFiltros.erro && (
        <Aviso variante="alerta">
          Não foi possível carregar as opções de filtro da Gold. As ordens continuam disponíveis,
          mas os filtros de região ficam sem valores.
        </Aviso>
      )}

      {toast && (
        <Aviso variante={toast.tipo === 'sucesso' ? 'sucesso' : 'perigo'} anunciar>
          {toast.texto}
        </Aviso>
      )}

      {destaqueParam && (
        <Aviso
          variante="info"
          titulo="Ordem recém-criada em destaque"
          acao={
            <Button variante="fantasma" tamanho="sm" onClick={limparDestaque}>
              Limpar destaque
            </Button>
          }
        >
          As ordens criadas a partir da fila aparecem com o selo “Recém-criada” na lista abaixo.
        </Aviso>
      )}

      {ordensConsulta.erro && !dados ? (
        <ErrorState
          erro={ordensConsulta.erro}
          titulo="Não foi possível carregar as ordens de inspeção"
          aoTentarNovamente={ordensConsulta.recarregar}
          className="rounded-card border border-borda bg-surface-card shadow-card"
        />
      ) : (
        <>
          <section
            aria-label="Filtrar ordens por status"
            className="grid grid-cols-2 gap-3 lg:grid-cols-5"
          >
            {cardsStatus.map((card) => {
              const ativo = statusFiltro === card.status
              return (
                <button
                  key={card.label}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => selecionarStatus(card.status)}
                  className={cx(
                    'flex flex-col items-start rounded-card border p-4 text-left shadow-card transition-colors',
                    ativo
                      ? 'border-teal bg-azul-50 ring-2 ring-teal/30'
                      : 'border-borda bg-surface-card hover:border-ink-3',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-legenda font-semibold tracking-wide text-ink-2 uppercase">
                    {card.ponto && (
                      <span aria-hidden="true" className={cx('size-2 rounded-full', card.ponto)} />
                    )}
                    {card.label}
                  </span>
                  <span
                    className={cx(
                      'mt-1.5 text-numero font-semibold tracking-tight',
                      ativo ? 'text-teal-profundo' : 'text-ink',
                    )}
                  >
                    {card.total.toLocaleString('pt-BR')}
                  </span>
                </button>
              )
            })}
          </section>

          <div className="flex flex-col gap-4">
            <ResultadoInspecoes
              filtros={{
                periodo_conclusao: periodoAtual,
                municipio,
                bairro,
                classe,
                alimentador,
              }}
              versao={contagem.CONCLUIDA}
            />

            <section
              aria-label="Lista de ordens de inspeção"
              className="overflow-hidden rounded-card border border-borda bg-surface-card shadow-card"
            >
              <div className="flex flex-col gap-3 border-b border-borda-leve p-4 md:flex-row md:items-start md:justify-between md:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-titulo-lg font-medium">Ordens de fiscalização</h2>
                    <SeloFicticio metadados={dados?.metadados} />
                  </div>
                  <p className="mt-1 text-legenda leading-5 text-ink-2">
                    Acompanhe o status, despache equipes e registre laudos de vistoria.
                  </p>
                  {dados?.metadados.gold_atualizada_em && (
                    <p className="mt-1 text-legenda text-ink-3">
                      Gold atualizada em {formatarAtualizacao(dados.metadados.gold_atualizada_em)}
                    </p>
                  )}
                  {atualizando && (
                    <p role="status" className="mt-1 text-legenda text-teal-profundo">
                      Atualizando ordens…
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <form onSubmit={handleSubmeterBuscaUc} className="flex items-center gap-1.5">
                    <div className="relative">
                      <Search
                        size={15}
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
                      />
                      <input
                        type="search"
                        aria-label="Buscar UC"
                        placeholder="Buscar UC…"
                        value={buscaUc}
                        onChange={(e) => setBuscaUc(e.target.value)}
                        className="h-9 w-40 rounded-md border border-borda bg-surface-card pr-3 pl-9 text-corpo text-ink transition-colors placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-teal focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco sm:w-48"
                      />
                    </div>
                    {ucFiltro && (
                      <button
                        type="button"
                        onClick={limparBuscaUc}
                        aria-label="Limpar busca de UC"
                        title="Limpar busca de UC"
                        className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-surface-alt hover:text-ink"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    )}
                  </form>

                  <Link to="/perdas/fila">
                    <Button
                      variante="secundario"
                      tamanho="sm"
                      icone={<Search size={14} aria-hidden="true" />}
                    >
                      Fila de inspeção
                    </Button>
                  </Link>
                </div>
              </div>

              {carregandoInicial ? (
                <div className="flex flex-col gap-2 p-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-md" />
                  ))}
                </div>
              ) : !dados || dados.items.length === 0 ? (
                <EmptyState
                  titulo="Nenhuma ordem encontrada"
                  descricao="Nenhuma ordem de inspeção respeita o status ou os filtros aplicados. Tente ajustar os parâmetros."
                  icone={<FileText size={28} strokeWidth={1.5} />}
                  acao={
                    <Button
                      variante="secundario"
                      tamanho="sm"
                      onClick={() => {
                        limpar()
                        limparBuscaUc()
                        selecionarStatus(undefined)
                      }}
                    >
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
                      className={cx(
                        'w-full min-w-[980px] border-collapse text-left text-legenda',
                        atualizando && 'opacity-60',
                      )}
                    >
                      <caption className="sr-only">Ordens de inspeção</caption>
                      <colgroup>
                        <col className="w-[120px]" />
                        <col className="w-[150px]" />
                        <col className="w-[180px]" />
                        <col className="w-[120px]" />
                        <col className="w-[120px]" />
                        <col className="w-[280px]" />
                      </colgroup>
                      <thead className="bg-surface-alt text-ink-2">
                        <tr>
                          <th scope="col" className="px-3 py-3">
                            Ordem
                          </th>
                          <th scope="col" className="px-3 py-3">
                            Unidade consumidora
                          </th>
                          <th scope="col" className="px-3 py-3">
                            Equipe
                          </th>
                          <th scope="col" className="px-3 py-3">
                            Data prevista
                          </th>
                          <th scope="col" className="px-3 py-3">
                            Status
                          </th>
                          <th scope="col" className="px-3 py-3 text-right">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.items.map((ordem) => {
                          const config = STATUS_CONFIG[ordem.status]
                          const destacada = destacadas.has(ordem.id_ordem)
                          return (
                            <tr
                              key={ordem.id_ordem}
                              className={cx(
                                'border-b border-borda-leve transition-colors last:border-b-0',
                                destacada ? 'bg-lima-suave' : 'hover:bg-surface-sutil',
                              )}
                            >
                              <td className="px-3 py-3">
                                <div className="flex flex-col gap-1">
                                  <span className="font-semibold text-ink">#{ordem.id_ordem}</span>
                                  <span className="text-micro text-ink-3">
                                    {formatarData(ordem.data_criacao)}
                                  </span>
                                  {destacada && <Badge variante="info">Recém-criada</Badge>}
                                </div>
                              </td>

                              <td className="px-3 py-3">
                                <Link
                                  to={`/unidades/${ordem.id_uc}`}
                                  className="font-medium text-teal-escuro hover:underline"
                                  title="Ver visão 360 da UC"
                                >
                                  {ordem.id_uc}
                                </Link>
                              </td>

                              <td className="px-3 py-3 font-medium text-ink">
                                {ordem.equipe_responsavel}
                              </td>

                              <td className="px-3 py-3 text-ink-2">
                                {formatarData(ordem.data_prevista)}
                              </td>

                              <td className="px-3 py-3">
                                <Badge variante={config.variante} ponto>
                                  {config.label}
                                </Badge>
                              </td>

                              <td className="px-3 py-3">
                                <AcoesOrdem
                                  ordem={ordem}
                                  aoIniciar={(selecionada) => {
                                    setOrdemSelecionada(selecionada)
                                    setModalIniciarAberto(true)
                                  }}
                                  aoConcluir={(selecionada) => {
                                    setOrdemSelecionada(selecionada)
                                    setModalConcluirAberto(true)
                                  }}
                                  aoCancelar={(selecionada) => {
                                    setOrdemSelecionada(selecionada)
                                    setModalCancelarAberto(true)
                                  }}
                                  aoVerDetalhes={(selecionada) => {
                                    setOrdemSelecionada(selecionada)
                                    setModalDetalhesAberto(true)
                                  }}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
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
          </div>
        </>
      )}

      {/* Modais da Gestão de Ordens */}
      <ModalIniciarCampo
        ordem={ordemSelecionada}
        aberto={modalIniciarAberto}
        aoFechar={() => setModalIniciarAberto(false)}
        aoSucesso={(atualizada) =>
          handleSucessoAcao(`Ordem #${atualizada.id_ordem} despachada para campo com sucesso.`)
        }
      />

      <ModalConcluirOrdem
        ordem={ordemSelecionada}
        aberto={modalConcluirAberto}
        aoFechar={() => setModalConcluirAberto(false)}
        aoSucesso={(atualizada) =>
          handleSucessoAcao(`Ordem #${atualizada.id_ordem} concluída com sucesso.`)
        }
      />

      <ModalCancelarOrdem
        ordem={ordemSelecionada}
        aberto={modalCancelarAberto}
        aoFechar={() => setModalCancelarAberto(false)}
        aoSucesso={(atualizada) =>
          handleSucessoAcao(`Ordem #${atualizada.id_ordem} cancelada com sucesso.`)
        }
      />

      <ModalDetalhesOrdem
        ordem={ordemSelecionada}
        aberto={modalDetalhesAberto}
        aoFechar={() => setModalDetalhesAberto(false)}
      />
    </Pagina>
  )
}
