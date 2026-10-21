import { Zap } from 'lucide-react'
import { cx } from '@/utils/cx'

type MarcaProps = { tamanho?: 'md' | 'sm' }

/** Marca da V-Energy: círculo azul-claro com o raio. */
export function LogoMarca({ tamanho = 'md' }: MarcaProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid shrink-0 place-items-center rounded-full bg-azul-300 text-teal-profundo',
        tamanho === 'md' ? 'size-10' : 'size-8',
      )}
    >
      <Zap size={tamanho === 'md' ? 22 : 18} strokeWidth={1.5} />
    </span>
  )
}

/** Marca + nome do produto. */
export default function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMarca />
      <span className="flex flex-col">
        <span className="text-[22px] font-semibold leading-[26px] text-marca">V-Energy</span>
        <span className="text-micro font-medium uppercase tracking-[0.24em] text-teal-escuro">
          Grid 360
        </span>
      </span>
    </span>
  )
}
