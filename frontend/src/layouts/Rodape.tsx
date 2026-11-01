import { USE_MOCKS } from '@/services/env'

export default function Rodape() {
  return (
    <footer className="px-4 py-6 pb-24 text-center text-legenda text-ink-3 md:pb-6">
      V-Energy Grid 360
      {USE_MOCKS && (
        <>
          {' '}
          <span aria-hidden="true">|</span> Dados fictícios (modo mock)
        </>
      )}
    </footer>
  )
}
