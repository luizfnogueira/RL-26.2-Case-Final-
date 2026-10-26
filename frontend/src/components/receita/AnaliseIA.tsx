import { ChevronDown, RotateCw, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Skeleton from '@/components/ui/Skeleton'
import type { ResultadoConsulta } from '@/hooks/useConsulta'
import type { RespostaInsight } from '@/types/ia'
import { cx } from '@/utils/cx'
import { formatarAtualizacao } from '@/utils/datas'
import { formatarIndicador } from '@/utils/formatacao'

type Props = {
  consulta: ResultadoConsulta<RespostaInsight>
  /** Motivo de não haver análise (ex.: sem decomposição para o recorte). Substitui o conteúdo. */
  indisponivel?: string
}

/**
 * Bloco "Análise da IA" no topo da Tela 2. O texto é gerado a partir de números já calculados na
 * Gold; aqui ele aparece só como texto (nunca como HTML), com selo de transparência e a lista dos
 * números usados. Se a IA falhar, só este bloco mostra o problema: o resto da tela segue.
 */
export default function AnaliseIA({ consulta, indisponivel }: Props) {
  const { dados, erro, carregando, recarregar } = consulta
  const [aberto, setAberto] = useState(false)
  const idLista = useId()

  return (
    <section
      aria-label="Análise da IA"
      aria-busy={carregando || undefined}
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
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-legenda font-medium tracking-wider text-teal-profundo uppercase">
              Análise da IA
            </p>
            <Badge variante="info">Gerado por IA</Badge>
            <Badge
              variante="neutro"
              title="O texto usa só números já calculados na Gold; a IA não estima valores."
            >
              Números calculados na Gold
            </Badge>
            <SeloFicticio metadados={dados?.metadados} />
          </div>

          {indisponivel ? (
            <p className="mt-2 text-corpo text-ink-2">{indisponivel}</p>
          ) : erro && !dados ? (
            <div role="alert" className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-corpo text-ink-2">
                A análise automática está indisponível agora. Os números da tela continuam corretos.
              </p>
              <Button
                variante="secundario"
                tamanho="sm"
                icone={<RotateCw size={14} aria-hidden="true" />}
                onClick={recarregar}
              >
                Tentar de novo
              </Button>
            </div>
          ) : !dados ? (
            <div className="mt-3 flex flex-col gap-2" aria-label="Gerando a análise">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : (
            <div className={cx('transition-opacity', carregando && 'opacity-60')}>
              <h2 className="mt-2 text-titulo-lg font-normal">{dados.titulo}</h2>
              <p className="mt-1 text-corpo text-ink-2">{dados.texto}</p>

              <button
                type="button"
                aria-expanded={aberto}
                aria-controls={idLista}
                onClick={() => setAberto((v) => !v)}
                className="mt-3 inline-flex items-center gap-1 rounded-sm text-legenda font-medium text-teal-profundo hover:underline"
              >
                Ver os {dados.numeros_utilizados.length} números utilizados
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
                aria-label="Números utilizados na análise"
              >
                {dados.numeros_utilizados.map((numero) => (
                  <li
                    key={numero.nome}
                    className="rounded-md border border-borda bg-surface-card px-2.5 py-1 text-legenda"
                  >
                    <span className="text-ink-2">{numero.rotulo}: </span>
                    <strong className="font-medium text-ink">{formatarIndicador(numero)}</strong>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-legenda text-ink-3">
                Gerado em {formatarAtualizacao(dados.gerado_em)}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
