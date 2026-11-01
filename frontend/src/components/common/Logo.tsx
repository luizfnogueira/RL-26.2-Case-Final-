import { Zap } from 'lucide-react'
import { cx } from '@/utils/cx'

type MarcaProps = { tamanho?: 'md' | 'sm' }

/** Marca da V-Energy: círculo teal com o raio. */
export function LogoMarca({ tamanho = 'md' }: MarcaProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid shrink-0 place-items-center rounded-md bg-azul-300 text-sobre-acao',
        tamanho === 'md' ? 'size-10' : 'size-8',
      )}
    >
      <Zap size={tamanho === 'md' ? 22 : 18} strokeWidth={2} />
    </span>
  )
}

/** Marca + nome do produto. */
export default function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMarca />
      <span className="flex flex-col">
        <span className="text-[20px] font-semibold leading-6 text-ink">V-Energy</span>
        <span className="text-micro font-semibold uppercase tracking-[0.24em] text-teal-escuro">
          Grid 360
        </span>
      </span>
    </span>
  )
}
