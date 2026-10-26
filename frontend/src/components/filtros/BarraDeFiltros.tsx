import { FilterX } from 'lucide-react'
import Button from '@/components/ui/Button'
import Select, { type OpcaoSelect } from '@/components/ui/Select'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import type { CampoFiltro, FiltrosUrl, OpcoesFiltros } from '@/types/filtros'
import { formatarNome } from '@/utils/formatacao'
import { PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO, formatarPeriodo } from '@/utils/periodos'
import { cx } from '@/utils/cx'

type Props = {
  campos: readonly CampoFiltro[]
  padroes?: FiltrosUrl
  opcoes?: OpcoesFiltros
  className?: string
  mostrarLimparSempre?: boolean
}

const ROTULOS: Record<CampoFiltro, string> = {
  periodo_atual: 'Período atual',
  periodo_comparacao: 'Comparar com',
  municipio: 'Município',
  bairro: 'Bairro',
  classe: 'Classe',
  alimentador: 'Alimentador',
}

const PERIODOS_PADRAO = [PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO]

const comoOpcoes = (valores: readonly string[] = [], nomes = false): OpcaoSelect[] =>
  valores.map((valor) => ({ valor, rotulo: nomes ? formatarNome(valor) : valor }))

export default function BarraDeFiltros({
  campos,
  padroes,
  opcoes = {},
  className,
  mostrarLimparSempre = false,
}: Props) {
  const { filtros, definir, limpar, alterados } = useFiltrosUrl(campos, padroes)

  const periodos: OpcaoSelect[] = (opcoes.periodos ?? PERIODOS_PADRAO).map((valor) => ({
    valor,
    rotulo: formatarPeriodo(valor),
  }))

  function opcoesDe(campo: CampoFiltro): OpcaoSelect[] {
    switch (campo) {
      case 'periodo_atual':
        return periodos.map((p) => ({ ...p, desabilitada: p.valor === filtros.periodo_comparacao }))
      case 'periodo_comparacao':
        return periodos.map((p) => ({ ...p, desabilitada: p.valor === filtros.periodo_atual }))
      case 'municipio':
        return comoOpcoes(opcoes.municipios, true)
      case 'bairro': {
        const { bairros } = opcoes
        if (Array.isArray(bairros)) return comoOpcoes(bairros, true)
        const porMunicipio = (bairros ?? {}) as Readonly<Record<string, readonly string[]>>
        return comoOpcoes(filtros.municipio ? porMunicipio[filtros.municipio] : [], true)
      }
      case 'classe':
        return comoOpcoes(opcoes.classes, true)
      case 'alimentador':
        return comoOpcoes(opcoes.alimentadores)
    }
  }

  return (
    <section
      aria-label="Filtros"
      className={cx('rounded-card bg-surface-card p-4 shadow-card md:px-6', className)}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        {campos.map((campo) => {
          const ehPeriodo = campo === 'periodo_atual' || campo === 'periodo_comparacao'
          return (
            <Select
              key={campo}
              rotulo={ROTULOS[campo]}
              opcoes={opcoesDe(campo)}
              valor={filtros[campo] ?? ''}
              aoMudar={(valor) => definir({ [campo]: valor })}
              vazio={ehPeriodo ? (padroes?.[campo] ? undefined : 'Selecione') : 'Todos'}
              disabled={campo === 'bairro' && !filtros.municipio}
              className="lg:w-52"
            />
          )
        })}
        {(alterados || mostrarLimparSempre) && (
          <Button
            variante="fantasma"
            tamanho="sm"
            icone={<FilterX size={16} aria-hidden="true" />}
            onClick={limpar}
            className="justify-self-start lg:mb-1.5"
          >
            Limpar filtros
          </Button>
        )}
      </div>
    </section>
  )
}
