import { ChevronDown, RotateCw, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import { useAcao } from '@/hooks/useAcao'
import { gerarInsight } from '@/services'
import type { ApiError } from '@/services/erro-api'
import { PREFIXO_TEXTO_ALTERNATIVO, type RespostaInsight } from '@/types/ia'
import { cx } from '@/utils/cx'
import { formatarAtualizacao } from '@/utils/datas'
import { formatarNumeroResumo } from './numerosResumo'

type Props = {
  idUc: string
  /** A mesma janela que a página usou no GET /unidades/{id} (`periodo_referencia`). */
  periodo: string
}

/** Mensagem do erro para o atendente; nenhum erro derruba o resto da tela. */
function mensagemDoErro(erro: ApiError): string {
  if (erro.status === 404) return 'Não há resumo disponível para esta unidade.'
  if (erro.codigo === 'GOLD_NAO_CARREGADA')
    return 'Os dados ainda não foram carregados no servidor. Tente de novo em instantes.'
  if (erro.status === 422) return 'Não foi possível gerar o resumo para o período desta tela.'
  if (erro.status === 0) return 'Sem conexão com o servidor. Confira a rede e tente de novo.'
  return 'Não foi possível gerar o resumo agora. Os números da tela continuam corretos.'
}

/**
 * Resumo da conta pela IA na Visão 360 (V1c), logo abaixo do diagnóstico. Só é pedido no clique: nada
 * é chamado ao abrir a UC. Depois de gerado, fica no card enquanto a página for desta UC (quem usa o
 * card troca a `key` ao mudar de UC, e ele volta ao estado inicial). O texto aparece só como texto.
 */
export default function ResumoUnidadeIA({ idUc, periodo }: Props) {
  const acao = useAcao((id: string, periodoAtual: string) =>
    gerarInsight({ contexto: 'unidade', id_uc: id, filtros: { periodo_atual: periodoAtual } }),
  )
  const { executar, executando, erro, resultado } = acao
  const gerar = () => void executar(idUc, periodo)

  return (
    <section
      aria-label="Resumo da conta"
      className="rounded-card border border-azul-300 bg-azul-50 p-4 shadow-card md:p-6"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-card text-teal-escuro"
        >
          <Sparkles size={20} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-legenda font-medium tracking-wider text-teal-profundo uppercase">
            Resumo da conta
          </p>

          {!resultado && (
            <>
              <p className="mt-1 text-corpo text-ink-2">
                Explica em poucas frases, para você repetir ao cliente, se o valor da conta subiu,
                caiu ou ficou estável e por quê, usando só os números já calculados nesta tela.
              </p>
              {!erro && (
                <Button
                  className="mt-3"
                  icone={<Sparkles size={16} aria-hidden="true" />}
                  carregando={executando}
                  onClick={gerar}
                >
                  {executando ? 'Gerando…' : 'Gerar resumo'}
                </Button>
              )}
            </>
          )}

          {erro && !executando && (
            <div role="alert" className="mt-3 flex flex-col items-start gap-2">
              <p className="text-corpo text-perigo-escuro">{mensagemDoErro(erro)}</p>
              <p className="text-legenda text-ink-2">O restante da tela continua válido.</p>
              <Button
                variante="secundario"
                tamanho="sm"
                icone={<RotateCw size={14} aria-hidden="true" />}
                onClick={gerar}
              >
                Tentar de novo
              </Button>
            </div>
          )}

          <div aria-live="polite" aria-busy={executando || undefined}>
            {executando && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-corpo text-ink-2">Gerando resumo, pode levar alguns segundos.</p>
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}
            {resultado && !executando && <Resultado resposta={resultado} />}
          </div>
        </div>
      </div>
    </section>
  )
}

function Resultado({ resposta }: { resposta: RespostaInsight }) {
  const [aberto, setAberto] = useState(false)
  const idLista = useId()
  // O texto por regra está correto: selo neutro, nunca de alerta (alerta é só para erro)
  const alternativo = resposta.metadados.observacoes.some((o) =>
    o.startsWith(PREFIXO_TEXTO_ALTERNATIVO),
  )

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {alternativo ? (
          <Badge variante="neutro">Texto alternativo</Badge>
        ) : (
          <Badge variante="info">Gerado por IA</Badge>
        )}
        <Badge
          variante="neutro"
          title="O texto usa só números já calculados na Gold; a IA não estima valores."
        >
          Números calculados na Gold
        </Badge>
        <SeloFicticio metadados={resposta.metadados} />
      </div>

      <h3 className="mt-2 text-titulo-lg font-normal">{resposta.titulo}</h3>
      <p className="mt-1 text-corpo">{resposta.texto}</p>
      {alternativo && (
        <p className="mt-1 text-legenda text-ink-2">
          Resumo montado por regra, com os mesmos números da tela.
        </p>
      )}

      {resposta.numeros_utilizados.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={idLista}
            onClick={() => setAberto((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 rounded-sm text-legenda font-medium text-teal-profundo hover:underline"
          >
            Ver os {resposta.numeros_utilizados.length} números utilizados
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cx('transition-transform', aberto && 'rotate-180')}
            />
          </button>
          <ul
            id={idLista}
            hidden={!aberto}
            className="mt-2 flex flex-wrap gap-2"
            aria-label="Números utilizados no resumo"
          >
            {resposta.numeros_utilizados.map((numero) => (
              <li
                key={numero.nome}
                className="rounded-md border border-borda bg-surface-card px-2.5 py-1 text-legenda"
              >
                <span className="text-ink-2">{numero.rotulo}: </span>
                <strong className="font-medium text-ink">{formatarNumeroResumo(numero)}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-legenda text-ink-3">
        Gerado em {formatarAtualizacao(resposta.gerado_em)}
      </p>
    </div>
  )
}
