import { cx } from '@/utils/cx'

type Props = {
  iniciais: string
  tamanho?: 'md' | 'sm'
  className?: string
}

export default function Avatar({ iniciais, tamanho = 'md', className }: Props) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid shrink-0 place-items-center rounded-full bg-azul-100 text-teal-profundo',
        tamanho === 'md' ? 'size-11 text-titulo font-normal' : 'size-8 text-legenda font-medium',
        className,
      )}
    >
      {iniciais}
    </span>
  )
}
