import type { ComponentProps } from 'react'
import { cx } from '@/utils/cx'

/**
 * Bloco cinza que ocupa o lugar do conteúdo enquanto carrega. Defina o tamanho por `className`
 * (ex.: `h-6 w-40`). A animação some para quem pede menos movimento.
 */
export default function Skeleton({ className, ...resto }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cx('rounded-md bg-surface-esqueleto motion-safe:animate-pulse', className)}
      {...resto}
    />
  )
}
