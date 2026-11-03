import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Info, Minus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import type { IndicadoresDashboard } from '@/types/dashboard'
import { cx } from '@/utils/cx'
import { formatarPercentual } from '@/utils/formatacao'
import { formatarPeriodo } from '@/utils/periodos'
import DetalheComparacao from './DetalheComparacao'
import { ORDEM_KPIS, valorExecutivo } from './indicadores'

type Props = { indicadores: IndicadoresDashboard }

const percentual = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

const ULTIMO = ORDEM_KPIS.length - 1

const ESTILO_SETA =
  'inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-legenda font-medium text-teal-escuro transition-colors hover:bg-azul-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco'

/**
 * Cartões de KPI. Além do valor, da variação e da comparação, cada cartão abre num modal a origem
 * do cálculo: os dois períodos, os valores de cada um e a conta que produziu a variação. O modal
 * navega entre os seis KPIs (setas no rodapé ou ← e →) sem fechar.
 */
export default function IndicadoresExecutivos({ indicadores }: Props) {
  // Índice em ORDEM_KPIS do KPI aberto no modal; null = modal fechado
  const [indiceAberto, setIndiceAberto] = useState<number | null>(null)
  const botoesOrigem = useRef<(HTMLButtonElement | null)[]>([])
  const setaAnterior = useRef<HTMLButtonElement>(null)
  const setaProxima = useRef<HTMLButtonElement>(null)
  const ultimoAtivo = useRef<number | null>(null)
  const focarSetaRestante = useRef(false)

  const navegar = useCallback(
    (passo: -1 | 1) => {
      if (indiceAberto === null) return
      const destino = indiceAberto + passo
      if (destino < 0 || destino > ULTIMO) return
      // Na ponta, a seta focada some: o foco passa para a que continua visível
      const focada = document.activeElement
      focarSetaRestante.current =
        (destino === 0 && focada === setaAnterior.current) ||
        (destino === ULTIMO && focada === setaProxima.current)
      setIndiceAberto(destino)
    },
    [indiceAberto],
  )

  useEffect(() => {
    if (indiceAberto === null) {
      // O Modal devolve o foco a quem o abriu; o certo é o botão do KPI ativo ao fechar. A limpeza
      // do Modal roda antes deste efeito, então este foco prevalece.
      if (ultimoAtivo.current !== null) botoesOrigem.current[ultimoAtivo.current]?.focus()
      ultimoAtivo.current = null
      return
    }
    ultimoAtivo.current = indiceAberto
    if (focarSetaRestante.current) {
      focarSetaRestante.current = false
      ;(setaAnterior.current ?? setaProxima.current)?.focus()
    }
  }, [indiceAberto])

  // ← e → só enquanto o modal está aberto, sem volta circular
  useEffect(() => {
    if (indiceAberto === null) return
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey) return
      if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return
      evento.preventDefault()
      navegar(evento.key === 'ArrowLeft' ? -1 : 1)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [indiceAberto, navegar])

  const kpiAberto = indiceAberto === null ? null : indicadores[ORDEM_KPIS[indiceAberto]]
  const vizinho = (indice: number) =>
    indice < 0 || indice > ULTIMO ? null : indicadores[ORDEM_KPIS[indice]].rotulo
  const anterior = indiceAberto === null ? null : vizinho(indiceAberto - 1)
  const proximo = indiceAberto === null ? null : vizinho(indiceAberto + 1)

  return (
    <>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
        aria-label="Seis indicadores executivos"
      >
        {ORDEM_KPIS.map((nome, indice) => {
          const kpi = indicadores[nome]
          const variacao = kpi.variacao_percentual.valor
          const menorMelhor = ['inadimplencia', 'dec_medio', 'fec_medio'].includes(nome)
          const favoravel = variacao !== null && (menorMelhor ? variacao < 0 : variacao > 0)
          const neutra = variacao === null || variacao === 0
          const Seta =
            variacao === null || variacao === 0
              ? Minus
              : variacao > 0
                ? ArrowUpRight
                : ArrowDownRight
          const continuidade = nome === 'dec_medio' || nome === 'fec_medio'
          const motivo = continuidade
            ? 'DEC/FEC indisponíveis para este recorte na fonte consultada.'
            : 'A fonte não informou este valor para o recorte.'
          const periodoComparacao = kpi.comparacao.periodo_referencia

          return (
            <Card key={nome} className="flex min-w-0 flex-col p-4!" aria-label={kpi.rotulo}>
              <h3 className="min-h-8 text-corpo font-medium text-ink-2">{kpi.rotulo}</h3>
              <p
                className="mt-1 truncate text-numero font-semibold tracking-tight text-ink"
                title={kpi.atual.valor === null ? motivo : valorExecutivo(kpi.atual, true)}
              >
                {valorExecutivo(kpi.atual)}
              </p>
              <p className="mt-0.5 min-h-4 text-legenda text-ink-2">
                {nome === 'dec_medio'
                  ? 'horas / UC'
                  : nome === 'fec_medio'
                    ? 'interrupções / UC'
                    : nome === 'ucs_ativas'
                      ? 'unidades consumidoras'
                      : '\u00a0'}
              </p>
              <div className="mt-3">
                <Badge
                  variante={neutra ? 'neutro' : favoravel ? 'sucesso' : 'perigo'}
                  title="Variação percentual em relação ao período de comparação"
                >
                  <Seta size={13} aria-hidden="true" />
                  {variacao === null
                    ? 'Sem comparação'
                    : formatarPercentual(variacao, { sinal: true })}
                </Badge>
              </div>
              <p
                className="mt-3 text-legenda leading-5 text-ink-2"
                title={valorExecutivo(kpi.comparacao, true)}
              >
                Comparação · {formatarPeriodo(periodoComparacao)}
                <br />
                <span className="font-medium text-ink">{valorExecutivo(kpi.comparacao)}</span>
              </p>
              {nome === 'inadimplencia' ? (
                <p className="mt-2 text-legenda leading-4 text-ink-2">
                  {indicadores.inadimplencia.percentual_receita_atual.valor === null
                    ? '—'
                    : formatarPercentual(
                        indicadores.inadimplencia.percentual_receita_atual.valor,
                      )}{' '}
                  da receita
                  <span className="mt-1 block">
                    {indicadores.inadimplencia.variacao_pontos_percentuais.valor === null
                      ? '—'
                      : `${percentual.format(indicadores.inadimplencia.variacao_pontos_percentuais.valor)} p.p.`}
                  </span>
                </p>
              ) : (
                <p
                  className={cx(
                    'mt-2 text-legenda leading-4',
                    kpi.atual.valor === null ? 'text-ink-2' : 'text-teal-profundo',
                  )}
                >
                  {kpi.atual.valor === null
                    ? motivo
                    : kpi.diferenca.valor === null
                      ? 'Diferença indisponível'
                      : `Diferença: ${kpi.diferenca.valor > 0 ? '+' : ''}${valorExecutivo(kpi.diferenca)}`}
                </p>
              )}

              <div className="mt-auto pt-3">
                <button
                  type="button"
                  ref={(botao) => {
                    botoesOrigem.current[indice] = botao
                  }}
                  onClick={() => setIndiceAberto(indice)}
                  aria-haspopup="dialog"
                  aria-label={`Origem da comparação: ${kpi.rotulo}`}
                  className="inline-flex cursor-pointer items-center gap-1 text-legenda font-medium text-teal-escuro hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                >
                  <Info size={14} aria-hidden="true" />
                  Origem da comparação
                </button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Um modal só: navegar troca o conteúdo sem fechar nem reabrir a janela */}
      <Modal
        aberto={kpiAberto !== null}
        aoFechar={() => setIndiceAberto(null)}
        titulo={kpiAberto?.rotulo ?? ''}
        descricao={
          indiceAberto === null
            ? undefined
            : `Indicador ${indiceAberto + 1} de ${ORDEM_KPIS.length}`
        }
        tamanho="md"
        animado
        rodape={
          // Duas colunas fixas: a seta ausente deixa o espaço vazio e a outra não muda de lugar
          <div className="grid w-full grid-cols-2 items-center gap-3">
            {anterior !== null ? (
              <button
                ref={setaAnterior}
                type="button"
                onClick={() => navegar(-1)}
                aria-label={`KPI anterior: ${anterior}`}
                className={cx(ESTILO_SETA, 'justify-self-start text-left')}
              >
                <ChevronLeft size={16} aria-hidden="true" className="shrink-0" />
                {anterior}
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            {proximo !== null ? (
              <button
                ref={setaProxima}
                type="button"
                onClick={() => navegar(1)}
                aria-label={`Próximo KPI: ${proximo}`}
                className={cx(ESTILO_SETA, 'justify-self-end text-right')}
              >
                {proximo}
                <ChevronRight size={16} aria-hidden="true" className="shrink-0" />
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
          </div>
        }
      >
        {/*
          Os seis detalhamentos ficam empilhados na mesma célula do grid: a altura é a do maior,
          igual em todos os KPIs, e o rodapé não se move. Só o ativo fica visível e acessível.
        */}
        <div className="grid">
          {ORDEM_KPIS.map((nome, indice) => {
            const ativo = indice === indiceAberto
            return (
              <div
                key={nome}
                data-detalhe-kpi={nome}
                aria-hidden={ativo ? undefined : true}
                inert={!ativo}
                className={cx(
                  'col-start-1 row-start-1 self-start',
                  // visibility entra na transição: quem sai fica visível até o fim do fade
                  'motion-safe:transition-[opacity,translate,visibility] motion-safe:duration-200 motion-safe:ease-out',
                  ativo
                    ? 'visible translate-x-0 opacity-100'
                    : 'pointer-events-none invisible opacity-0',
                  // Os seguintes esperam 8 px à direita e os anteriores à esquerda: ">" traz o
                  // novo da direita e "<" da esquerda, sem guardar a direção
                  !ativo &&
                    indiceAberto !== null &&
                    (indice > indiceAberto ? 'translate-x-2' : '-translate-x-2'),
                )}
              >
                <DetalheComparacao kpi={indicadores[nome]} />
              </div>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
