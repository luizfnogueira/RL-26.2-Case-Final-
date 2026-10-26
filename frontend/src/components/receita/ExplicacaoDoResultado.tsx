import Card from '@/components/ui/Card'
import { cx } from '@/utils/cx'
import type { PontoDeExplicacao } from './explicacao'

const TONS: Record<PontoDeExplicacao['tom'], string> = {
  positivo: 'bg-sucesso-suave text-sucesso-texto',
  negativo: 'bg-perigo-suave text-perigo-escuro',
  neutro: 'bg-surface-alt text-ink',
}

type Props = { pontos: PontoDeExplicacao[]; atualizando?: boolean }

export default function ExplicacaoDoResultado({ pontos, atualizando }: Props) {
  return (
    <Card
      titulo="O que explica o resultado?"
      className={atualizando ? 'opacity-70 transition-opacity' : 'transition-opacity'}
    >
      {pontos.length === 0 ? (
        <p className="text-corpo text-ink-2">
          Sem decomposição de preço e volume para este recorte, não há o que explicar.
        </p>
      ) : (
        <ol className="divide-y divide-borda-leve">
          {pontos.map((ponto, i) => (
            <li key={ponto.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
              <span
                aria-hidden="true"
                className={cx(
                  'grid size-9 shrink-0 place-items-center rounded-md text-legenda font-medium',
                  TONS[ponto.tom],
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-corpo font-medium">{ponto.titulo}</h3>
                <p className="text-corpo text-ink-2">{ponto.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
