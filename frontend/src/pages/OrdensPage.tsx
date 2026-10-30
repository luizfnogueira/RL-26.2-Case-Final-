import {
  CheckCircle2,
  FileText,
  History,
  MoreHorizontal,
  Search,
  Truck,
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
  { label: string; variante: VarianteBadge; bgCard: string }
> = {
  ABERTA: { label: 'Aberta', variante: 'info', bgCard: 'border-l-4 border-l-blue-400' },
  EM_CAMPO: { label: 'Em campo', variante: 'alerta', bgCard: 'border-l-4 border-l-amber-400' },
  CONCLUIDA: { label: 'Concluída', variante: 'sucesso', bgCard: 'border-l-4 border-l-emerald-400' },
  CANCELADA: { label: 'Cancelada', variante: 'neutro', bgCard: 'border-l-4 border-l-slate-400' },
}

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

function AcoesOrdem({ ordem, aoIniciar, aoConcluir, aoCancelar, aoVerDetalhes }: AcoesOrdemProps) {
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const idMenu = `acoes-ordem-${ordem.id_ordem}`
  const quantidadeAcoes = ordem.status === 'ABERTA' || ordem.status === 'EM_CAMPO' ? 3 : 1

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
      const alturaMenu = quantidadeAcoes * 32 + 14
      const larguraMenu = 208
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

  return (
    <>
      <div
        role="group"
        aria-label={`Ações da ordem #${ordem.id_ordem}`}
        className="flex justify-center"
      >
        <Button
          ref={botaoRef}
          variante="secundario"
          tamanho="sm"
          aria-label={`Ações da ordem #${ordem.id_ordem}`}
          aria-expanded={aberto}
          aria-controls={idMenu}
          title="Abrir ações"
          className="size-9 border-transparent bg-[#f7fafb] p-0 text-[#526777] hover:border-[#dfeaf0] hover:bg-[#edf5f8]"
          onClick={alternarMenu}
          icone={<MoreHorizontal size={20} aria-hidden="true" />}
        />
      </div>

      {createPortal(
        <div
          ref={menuRef}
          id={idMenu}
          hidden={!aberto}
          style={{ position: 'fixed', top: posicao.top, left: posicao.left }}
          className="z-50 w-52 rounded-xl border border-[#dfeaf0] bg-white p-1.5 text-left shadow-lg"
          role="group"
          aria-label={`Opções da ordem #${ordem.id_ordem}`}
        >
          {ordem.status === 'ABERTA' && (
            <Button
              variante="fantasma"
              tamanho="sm"
              className="w-full justify-center rounded-lg px-3"
              onClick={() => executarAcao(aoIniciar)}
              icone={<Truck size={15} aria-hidden="true" />}
            >
              Iniciar campo
            </Button>
          )}
          {ordem.status === 'EM_CAMPO' && (
            <Button
              variante="fantasma"
              tamanho="sm"
              className="w-full justify-center rounded-lg px-3"
              onClick={() => executarAcao(aoConcluir)}
              icone={<CheckCircle2 size={15} aria-hidden="true" />}
            >
              Registrar resultado
            </Button>
          )}
          {(ordem.status === 'ABERTA' || ordem.status === 'EM_CAMPO') && (
            <Button
              variante="fantasma"
              tamanho="sm"
              className="w-full justify-center rounded-lg px-3 text-[#8a3333] hover:bg-rose-50"
              onClick={() => executarAcao(aoCancelar)}
              icone={<XCircle size={15} aria-hidden="true" />}
            >
              Cancelar ordem
            </Button>
          )}
          <Button
            variante="fantasma"
            tamanho="sm"
            className="w-full justify-center rounded-lg px-3"
            onClick={() => executarAcao(aoVerDetalhes)}
            icone={<History size={15} aria-hidden="true" />}
          >
            Ver detalhes
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
    const timer = window.setTimeout(() => setToast(null), 3500)
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

  return (
    <Pagina titulo="Ordens de inspeção" subtitulo="Gestão do ciclo completo da fiscalização">
      <div className="relative">
        {toast && (
          <div
            aria-live="polite"
            className={[
              'fixed top-5 right-5 z-50 flex items-center gap-3 rounded-full border px-4 py-2.5 text-sm shadow-xl transition-all',
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
            opcoes={opcoesBarra}
            mostrarLimparSempre
            className="rounded-none border-b border-[#dfeaf0] bg-[#edf3f5] p-4 shadow-none"
          />

          {opcoesFiltros.erro && (
            <p
              role="status"
              className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-[12px] text-amber-900"
            >
              Não foi possível carregar as opções de filtro da Gold. As ordens continuam
              disponíveis, mas os filtros de região ficam sem valores.
            </p>
          )}

          {ordensConsulta.erro && !dados ? (
            <ErrorState
              erro={ordensConsulta.erro}
              titulo="Não foi possível carregar as ordens de inspeção"
              aoTentarNovamente={ordensConsulta.recarregar}
              className="min-h-[320px] bg-white/50"
            />
          ) : (
            <>
              {/* Cards de Resumo por Status */}
              <div className="mt-4 mb-4 grid grid-cols-2 gap-0 overflow-hidden rounded-[16px] bg-[#36465f] text-white sm:grid-cols-4">
                <div
                  onClick={() => selecionarStatus('ABERTA')}
                  className={`cursor-pointer border-r border-white/10 px-5 py-4 transition-colors hover:bg-white/5 ${
                    statusFiltro === 'ABERTA' ? 'bg-white/10' : ''
                  }`}
                >
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-blue-100/70">
                    Aberta
                  </p>
                  <p className="mt-2 text-[20px] font-semibold text-white">
                    {contagem.ABERTA.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div
                  onClick={() => selecionarStatus('EM_CAMPO')}
                  className={`cursor-pointer border-r border-white/10 px-5 py-4 transition-colors hover:bg-white/5 ${
                    statusFiltro === 'EM_CAMPO' ? 'bg-white/10' : ''
                  }`}
                >
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-blue-100/70">
                    Em campo
                  </p>
                  <p className="mt-2 text-[20px] font-semibold text-white">
                    {contagem.EM_CAMPO.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div
                  onClick={() => selecionarStatus('CONCLUIDA')}
                  className={`cursor-pointer border-r border-white/10 px-5 py-4 transition-colors hover:bg-white/5 ${
                    statusFiltro === 'CONCLUIDA' ? 'bg-white/10' : ''
                  }`}
                >
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-blue-100/70">
                    Concluída
                  </p>
                  <p className="mt-2 text-[20px] font-semibold text-white">
                    {contagem.CONCLUIDA.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div
                  onClick={() => selecionarStatus('CANCELADA')}
                  className={`cursor-pointer px-5 py-4 transition-colors hover:bg-white/5 ${
                    statusFiltro === 'CANCELADA' ? 'bg-white/10' : ''
                  }`}
                >
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-blue-100/70">
                    Cancelada
                  </p>
                  <p className="mt-2 text-[20px] font-semibold text-white">
                    {contagem.CANCELADA.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              {/* Área principal da listagem */}
              <div className="bg-[#f4f6f7] p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[20px] font-medium text-[#2e2e2e]">
                        Ordens de fiscalização
                      </h2>
                      <SeloFicticio metadados={dados?.metadados} />
                    </div>
                    <p className="text-[12px] text-[#68737b]">
                      Acompanhe o status, despache equipes e registre laudos de vistoria
                    </p>
                    {dados?.metadados.gold_atualizada_em && (
                      <p className="text-[12px] text-[#68737b]">
                        Gold atualizada em {formatarAtualizacao(dados.metadados.gold_atualizada_em)}
                      </p>
                    )}
                    {atualizando && (
                      <p role="status" className="mt-1 text-[12px] text-teal-profundo">
                        Atualizando ordens…
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Campo de busca por UC */}
                    <form onSubmit={handleSubmeterBuscaUc} className="flex items-center gap-1.5">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7d858d]"
                        />
                        <input
                          type="text"
                          placeholder="Buscar UC..."
                          value={buscaUc}
                          onChange={(e) => setBuscaUc(e.target.value)}
                          className="h-9 w-36 rounded-full border border-[#cfd9e0] bg-white pl-8 pr-3 text-xs text-[#242b32] outline-none focus:border-[#6aa5b4] sm:w-44"
                        />
                      </div>
                      {ucFiltro && (
                        <button
                          type="button"
                          onClick={limparBuscaUc}
                          title="Limpar busca de UC"
                          className="text-xs text-[#7d858d] hover:text-[#2d425a]"
                        >
                          ✕
                        </button>
                      )}
                    </form>

                    {/* Link de volta à Fila */}
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

                {/* Abas de Filtro por Status */}
                <div className="mb-4 flex flex-wrap gap-2 border-b border-[#dfeaf0] pb-3">
                  <button
                    type="button"
                    onClick={() => selecionarStatus(undefined)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                      statusFiltro === undefined
                        ? 'bg-[#2d425a] text-white shadow-sm'
                        : 'bg-white/80 text-[#59656d] hover:bg-white'
                    }`}
                  >
                    Todas
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        statusFiltro === undefined
                          ? 'bg-white/20 text-white'
                          : 'bg-[#e2eaf0] text-[#59656d]'
                      }`}
                    >
                      {totalGeral}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => selecionarStatus('ABERTA')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                      statusFiltro === 'ABERTA'
                        ? 'bg-[#2d425a] text-white shadow-sm'
                        : 'bg-white/80 text-[#59656d] hover:bg-white'
                    }`}
                  >
                    Aberta
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        statusFiltro === 'ABERTA'
                          ? 'bg-white/20 text-white'
                          : 'bg-azul-50 text-teal-profundo'
                      }`}
                    >
                      {contagem.ABERTA}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => selecionarStatus('EM_CAMPO')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                      statusFiltro === 'EM_CAMPO'
                        ? 'bg-[#2d425a] text-white shadow-sm'
                        : 'bg-white/80 text-[#59656d] hover:bg-white'
                    }`}
                  >
                    Em campo
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        statusFiltro === 'EM_CAMPO'
                          ? 'bg-white/20 text-white'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {contagem.EM_CAMPO}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => selecionarStatus('CONCLUIDA')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                      statusFiltro === 'CONCLUIDA'
                        ? 'bg-[#2d425a] text-white shadow-sm'
                        : 'bg-white/80 text-[#59656d] hover:bg-white'
                    }`}
                  >
                    Concluída
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        statusFiltro === 'CONCLUIDA'
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {contagem.CONCLUIDA}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => selecionarStatus('CANCELADA')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                      statusFiltro === 'CANCELADA'
                        ? 'bg-[#2d425a] text-white shadow-sm'
                        : 'bg-white/80 text-[#59656d] hover:bg-white'
                    }`}
                  >
                    Cancelada
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        statusFiltro === 'CANCELADA'
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 text-slate-800'
                      }`}
                    >
                      {contagem.CANCELADA}
                    </span>
                  </button>
                </div>

                {/* Conteúdo da Tabela */}
                {carregandoInicial ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-lg" />
                    ))}
                  </div>
                ) : !dados || dados.items.length === 0 ? (
                  <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-[#dfeaf0] bg-white/50">
                    <EmptyState
                      titulo="Nenhuma ordem encontrada"
                      descricao="Nenhuma ordem de inspeção respeita o status ou filtros aplicados. Tente ajustar os parâmetros."
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
                    />
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[#dfeaf0] bg-white shadow-xs">
                    <div className="overflow-x-auto">
                      <table
                        aria-busy={atualizando}
                        className={`w-full min-w-[960px] table-fixed border-collapse text-left text-[12px] ${
                          atualizando ? 'opacity-60' : ''
                        }`}
                      >
                        <colgroup>
                          <col className="w-24" />
                          <col className="w-36" />
                          <col className="w-40" />
                          <col className="w-28" />
                          <col className="w-28" />
                          <col className="w-40" />
                        </colgroup>
                        <thead className="bg-[#2d425a] text-white">
                          <tr>
                            <th className="px-3 py-3 text-center">Ordem</th>
                            <th className="px-3 py-3">Unidade consumidora</th>
                            <th className="px-3 py-3">Equipe</th>
                            <th className="px-3 py-3">Data prevista</th>
                            <th className="px-3 py-3">Status</th>
                            <th className="px-3 py-3 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dados.items.map((ordem, index) => {
                            const config = STATUS_CONFIG[ordem.status]
                            return (
                              <tr
                                key={ordem.id_ordem}
                                className={index % 2 === 0 ? 'bg-white' : 'bg-[#f8fafb]'}
                              >
                                <td className="border-b border-[#edf2f5] px-3 py-3 text-center font-bold text-[#2d425a]">
                                  #{ordem.id_ordem}
                                  <span className="block text-[10px] font-normal text-[#7d858d]">
                                    {formatarData(ordem.data_criacao)}
                                  </span>
                                </td>

                                <td className="border-b border-[#edf2f5] px-3 py-3">
                                  <Link
                                    to={`/unidades/${ordem.id_uc}`}
                                    className="font-semibold text-[#2d6a80] hover:underline"
                                    title="Ver visão 360 da UC"
                                  >
                                    {ordem.id_uc}
                                  </Link>
                                </td>

                                <td className="border-b border-[#edf2f5] px-3 py-3 font-medium text-[#2c2d2d]">
                                  {ordem.equipe_responsavel}
                                </td>

                                <td className="border-b border-[#edf2f5] px-3 py-3 text-[#59656d]">
                                  {formatarData(ordem.data_prevista)}
                                </td>

                                <td className="border-b border-[#edf2f5] px-3 py-3">
                                  <Badge variante={config.variante} ponto>
                                    {config.label}
                                  </Badge>
                                </td>

                                <td className="border-b border-[#edf2f5] px-3 py-3 text-center">
                                  <AcoesOrdem
                                    ordem={ordem}
                                    aoIniciar={(ordem) => {
                                      setOrdemSelecionada(ordem)
                                      setModalIniciarAberto(true)
                                    }}
                                    aoConcluir={(ordem) => {
                                      setOrdemSelecionada(ordem)
                                      setModalConcluirAberto(true)
                                    }}
                                    aoCancelar={(ordem) => {
                                      setOrdemSelecionada(ordem)
                                      setModalCancelarAberto(true)
                                    }}
                                    aoVerDetalhes={(ordem) => {
                                      setOrdemSelecionada(ordem)
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
                      <div className="border-t border-[#dfeaf0] p-4 bg-white">
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
          )}
        </div>
      </div>

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
