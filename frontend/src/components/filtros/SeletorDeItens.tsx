import { useId } from 'react'
import Select, { type OpcaoSelect } from '@/components/ui/Select'
import type { OpcoesFiltros } from '@/types/filtros'
import { formatarNome } from '@/utils/formatacao'
import { cx } from '@/utils/cx'
import {
  MAXIMO_ITENS,
  MINIMO_ITENS,
  itensDisponiveis,
  type NivelComparacao,
  type SelecaoItens,
} from './selecaoItens'

const NIVEIS: OpcaoSelect[] = [
  { valor: 'municipio', rotulo: 'Município' },
  { valor: 'bairro', rotulo: 'Bairro' },
  { valor: 'classe', rotulo: 'Classe' },
]

type Props = {
  opcoes: OpcoesFiltros
  valor: SelecaoItens
  aoMudar: (valor: SelecaoItens) => void
  className?: string
}

/**
 * Escolha do nível (município, bairro ou classe) e de 2 a 4 itens para comparar lado a lado.
 * Os valores saem de GET /filtros sem alteração (ex.: RECIFE); só o rótulo é formatado.
 */
export default function SeletorDeItens({ opcoes, valor, aoMudar, className }: Props) {
  const idAjuda = useId()
  const disponiveis = itensDisponiveis(opcoes, valor)
  const cheio = valor.itens.length >= MAXIMO_ITENS
  const faltam = MINIMO_ITENS - valor.itens.length
  const semMunicipio = valor.nivel === 'bairro' && !valor.municipio

  function alternar(item: string) {
    const itens = valor.itens.includes(item)
      ? valor.itens.filter((i) => i !== item)
      : [...valor.itens, item]
    if (itens.length <= MAXIMO_ITENS) aoMudar({ ...valor, itens })
  }

  let ajuda = `${valor.itens.length} de ${MAXIMO_ITENS} selecionados.`
  if (semMunicipio) ajuda = 'Escolha o município para ver os bairros.'
  else if (faltam > 0)
    ajuda = `Escolha mais ${faltam} ${faltam === 1 ? 'item' : 'itens'} (mínimo ${MINIMO_ITENS}).`
  else if (cheio) ajuda = `Limite de ${MAXIMO_ITENS} itens: desmarque um para trocar.`

  return (
    <section aria-label="Itens para comparar" className={cx('flex flex-col gap-3', className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:items-end">
        <Select
          rotulo="Comparar por"
          opcoes={NIVEIS}
          valor={valor.nivel}
          aoMudar={(nivel) => aoMudar({ nivel: nivel as NivelComparacao, itens: [] })}
          className="lg:w-52"
        />
        {valor.nivel === 'bairro' && (
          <Select
            rotulo="Município"
            opcoes={(opcoes.municipios ?? []).map((m) => ({ valor: m, rotulo: formatarNome(m) }))}
            valor={valor.municipio ?? ''}
            aoMudar={(municipio) =>
              aoMudar({ ...valor, municipio: municipio || undefined, itens: [] })
            }
            vazio="Selecione"
            className="lg:w-52"
          />
        )}
      </div>

      <fieldset aria-describedby={idAjuda} className="flex flex-col gap-2">
        <legend className="mb-1 text-legenda font-medium text-ink">Itens</legend>
        {disponiveis.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {disponiveis.map((item) => {
              const marcado = valor.itens.includes(item)
              const bloqueado = !marcado && cheio
              return (
                <label
                  key={item}
                  className={cx(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-corpo',
                    marcado
                      ? 'border-teal-escuro bg-azul-50 text-teal-profundo'
                      : 'border-borda bg-surface-card text-ink',
                    bloqueado ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={bloqueado}
                    onChange={() => alternar(item)}
                    className="h-4 w-4 accent-teal-escuro"
                  />
                  {formatarNome(item)}
                </label>
              )
            })}
          </div>
        )}
        <p id={idAjuda} aria-live="polite" className="text-legenda text-ink-2">
          {ajuda}
        </p>
      </fieldset>
    </section>
  )
}
