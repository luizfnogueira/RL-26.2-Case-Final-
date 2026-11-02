import { FilterX, SlidersHorizontal } from 'lucide-react'
import Button from '@/components/ui/Button'
import Select, { type OpcaoSelect } from '@/components/ui/Select'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import type { CampoFiltro, FiltrosUrl, OpcoesFiltros } from '@/types/filtros'
import { cx } from '@/utils/cx'
import { formatarNome } from '@/utils/formatacao'
import { PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO, formatarPeriodo } from '@/utils/periodos'

type Props = {
  campos: readonly CampoFiltro[]
  padroes?: FiltrosUrl
  opcoes?: OpcoesFiltros
  className?: string
  /** Mantido por compatibilidade: a barra padrão sempre oferece "Limpar filtros". */
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

/**
 * Ordem única dos campos em todas as telas. A tela escolhe quais campos usa; a barra mantém
 * sempre a mesma sequência, os mesmos rótulos e o mesmo comportamento.
 */
const ORDEM: readonly CampoFiltro[] = [
  'periodo_atual',
  'periodo_comparacao',
  'municipio',
  'bairro',
  'classe',
  'alimentador',
]

const PERIODOS_PADRAO = [PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO]

const comoOpcoes = (valores: readonly string[] = [], nomes = false): OpcaoSelect[] =>
  valores.map((valor) => ({ valor, rotulo: nomes ? formatarNome(valor) : valor }))

/**
 * Barra de filtros comum às telas. Mesma ordem de campos, mesmos rótulos e mesmo botão de limpar
 * em Fila de perdas, Receita, Ordens e Painel. Os valores vivem na URL, então recarregar a página
 * preserva o recorte.
 */
export default function BarraDeFiltros({ campos, padroes, opcoes = {}, className }: Props) {
  const { filtros, definir, limpar, alterados } = useFiltrosUrl(campos, padroes)
  const visiveis = ORDEM.filter((campo) => campos.includes(campo))

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
      case 'alimentador': {
        const { alimentadores } = opcoes
        if (Array.isArray(alimentadores)) return comoOpcoes(alimentadores)
        const porMunicipio = (alimentadores ?? {}) as Readonly<Record<string, readonly string[]>>
        // Com município escolhido, só os alimentadores que o atendem; sem município, todos.
        const valores = filtros.municipio
          ? (porMunicipio[filtros.municipio] ?? [])
          : [...new Set(Object.values(porMunicipio).flat())]
        return comoOpcoes(valores)
      }
    }
  }

  return (
    <section
      aria-label="Filtros"
      className={cx(
        'rounded-card border border-borda bg-surface-card p-4 shadow-card md:px-5',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-legenda font-semibold tracking-wide text-ink-2 uppercase">
          <SlidersHorizontal size={15} aria-hidden="true" />
          Filtros
        </h2>
        {alterados && (
          <span className="text-legenda text-ink-2" role="status">
            Recorte personalizado
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        {visiveis.map((campo) => {
          const ehPeriodo = campo === 'periodo_atual' || campo === 'periodo_comparacao'
          const bairroSemMunicipio = campo === 'bairro' && !filtros.municipio
          return (
            <Select
              key={campo}
              rotulo={ROTULOS[campo]}
              opcoes={opcoesDe(campo)}
              valor={filtros[campo] ?? ''}
              aoMudar={(valor) => definir({ [campo]: valor })}
              vazio={ehPeriodo ? (padroes?.[campo] ? undefined : 'Selecione') : 'Todos'}
              disabled={bairroSemMunicipio}
              title={
                bairroSemMunicipio ? 'Escolha um município para filtrar por bairro' : undefined
              }
              className="lg:w-48"
            />
          )
        })}
        <Button
          variante="fantasma"
          tamanho="sm"
          icone={<FilterX size={16} aria-hidden="true" />}
          onClick={limpar}
          disabled={!alterados}
          motivoDesabilitado="Nenhum filtro foi alterado neste recorte."
          className="justify-self-start lg:mb-1.5"
        >
          Limpar filtros
        </Button>
      </div>
    </section>
  )
}
