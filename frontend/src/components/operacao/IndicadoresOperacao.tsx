import { Clock3, Radio, Timer, Zap } from 'lucide-react'
import Card from '@/components/ui/Card'
import type { RankingAlimentador } from '@/types/operacao'
import { numeroOperacao, unidadeOperacao } from './formatacao'

export default function IndicadoresOperacao({ alimentador }: { alimentador: RankingAlimentador }) {
  const campos = [
    {
      nome: 'dec',
      titulo: 'DEC',
      descricao: 'Duração média por UC',
      icone: Clock3,
      semCritico: alimentador.dec_sem_dia_critico,
    },
    {
      nome: 'fec',
      titulo: 'FEC',
      descricao: 'Frequência média por UC',
      icone: Radio,
      semCritico: alimentador.fec_sem_dia_critico,
    },
    {
      nome: 'interrupcoes',
      titulo: 'Interrupções',
      descricao: 'Ocorrências no período',
      icone: Zap,
      semCritico: null,
    },
    {
      nome: 'horas_interrupcao',
      titulo: 'CHI',
      descricao: 'Consumidor-hora interrompido',
      icone: Timer,
      semCritico: null,
    },
  ] as const
  return (
    <section
      aria-label={`Indicadores de ${alimentador.alimentador}`}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {campos.map((campo) => {
        const indicador = alimentador[campo.nome]
        return (
          <Card key={campo.nome} className="min-w-0 p-4!">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-corpo font-medium text-ink-2">{campo.titulo}</h3>
              <campo.icone
                size={19}
                strokeWidth={1.5}
                className="text-teal-escuro"
                aria-hidden="true"
              />
            </div>
            <p
              className="mt-4 text-numero font-medium tracking-tight"
              title={
                indicador.valor === null ? 'Indicador indisponível na fonte consultada.' : undefined
              }
            >
              {numeroOperacao(indicador.valor, campo.nome === 'interrupcoes')}
              <span className="ml-1.5 text-legenda font-normal text-ink-2">
                {unidadeOperacao(indicador)}
              </span>
            </p>
            <p className="mt-1 text-legenda text-ink-2">{campo.descricao}</p>
            {campo.semCritico && (
              <p
                className="mt-3 border-t border-borda-leve pt-3 text-legenda text-ink-2"
                title={
                  campo.semCritico.valor === null
                    ? 'A fonte não disponibiliza este indicador sem dias críticos.'
                    : undefined
                }
              >
                Sem dias críticos:{' '}
                <span className="font-medium text-teal-profundo">
                  {numeroOperacao(campo.semCritico.valor)} {unidadeOperacao(campo.semCritico)}
                </span>
              </p>
            )}
          </Card>
        )
      })}
    </section>
  )
}
