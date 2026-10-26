import { useId, type ComponentProps } from 'react'
import { cx } from '@/utils/cx'
import Campo from './Campo'
import { descricaoDoCampo, ESTILO_CONTROLE } from './estilos-campo'

type Props = Omit<ComponentProps<'input'>, 'id'> & {
  rotulo: string
  rotuloOculto?: boolean
  ajuda?: string
  /** Mensagem de erro: marca o campo como inválido e é lida por leitores de tela. */
  erro?: string
  id?: string
}

export default function Input({
  rotulo,
  rotuloOculto,
  ajuda,
  erro,
  id: idProp,
  className,
  ...resto
}: Props) {
  const gerado = useId()
  const id = idProp ?? gerado
  return (
    <Campo id={id} rotulo={rotulo} rotuloOculto={rotuloOculto} ajuda={ajuda} erro={erro}>
      <input
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricaoDoCampo(id, ajuda, erro)}
        className={cx(ESTILO_CONTROLE, erro ? 'border-perigo' : 'border-borda', className)}
        {...resto}
      />
    </Campo>
  )
}
