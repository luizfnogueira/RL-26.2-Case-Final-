import { ChevronDown } from 'lucide-react'
import { useId, type ComponentProps } from 'react'
import { cx } from '@/utils/cx'
import Campo from './Campo'
import { descricaoDoCampo, ESTILO_CONTROLE } from './estilos-campo'

export interface OpcaoSelect {
  valor: string
  rotulo: string
  desabilitada?: boolean
}

type Props = Omit<ComponentProps<'select'>, 'id' | 'value' | 'onChange' | 'children'> & {
  rotulo: string
  rotuloOculto?: boolean
  opcoes: readonly OpcaoSelect[]
  /** Valor selecionado; string vazia significa "nenhum" (mostra o `vazio`). */
  valor: string
  aoMudar: (valor: string) => void
  /** Texto da opção sem valor (ex.: "Todos"). Sem ele, não há opção vazia. */
  vazio?: string
  ajuda?: string
  erro?: string
  id?: string
}

/** Lista suspensa nativa, estilizada: teclado, leitor de tela e menu do celular funcionam de graça. */
export default function Select({
  rotulo,
  rotuloOculto,
  opcoes,
  valor,
  aoMudar,
  vazio,
  ajuda,
  erro,
  id: idProp,
  className,
  ...resto
}: Props) {
  const gerado = useId()
  const id = idProp ?? gerado
  return (
    <Campo
      id={id}
      rotulo={rotulo}
      rotuloOculto={rotuloOculto}
      ajuda={ajuda}
      erro={erro}
      className={className}
    >
      <div className="relative">
        <select
          id={id}
          value={valor}
          onChange={(evento) => aoMudar(evento.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricaoDoCampo(id, ajuda, erro)}
          className={cx(
            ESTILO_CONTROLE,
            'appearance-none pr-9',
            erro ? 'border-perigo' : 'border-borda',
          )}
          {...resto}
        >
          {vazio !== undefined && <option value="">{vazio}</option>}
          {opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor} disabled={opcao.desabilitada}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={18}
          strokeWidth={1.5}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3"
        />
      </div>
    </Campo>
  )
}
