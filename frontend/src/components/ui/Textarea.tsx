import { useId, type ComponentProps } from 'react'
import { cx } from '@/utils/cx'
import Campo from './Campo'
import { descricaoDoCampo, ESTILO_CONTROLE } from './estilos-campo'

type Props = Omit<ComponentProps<'textarea'>, 'id'> & {
  rotulo: string
  rotuloOculto?: boolean
  ajuda?: string
  /** Mensagem de erro: marca o campo como inválido e é lida por leitores de tela. */
  erro?: string
  id?: string
}

/** Área de texto multilinha com o mesmo rótulo, ajuda e erro do Input. */
export default function Textarea({
  rotulo,
  rotuloOculto,
  ajuda,
  erro,
  id: idProp,
  className,
  rows = 3,
  ...resto
}: Props) {
  const gerado = useId()
  const id = idProp ?? gerado
  return (
    <Campo id={id} rotulo={rotulo} rotuloOculto={rotuloOculto} ajuda={ajuda} erro={erro}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricaoDoCampo(id, ajuda, erro)}
        className={cx(
          ESTILO_CONTROLE,
          'h-auto resize-y py-2 leading-6',
          erro ? 'border-perigo' : 'border-borda',
          className,
        )}
        {...resto}
      />
    </Campo>
  )
}
