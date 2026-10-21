import { USE_MOCKS } from '@/services/env'

export default function Rodape() {
  return (
    <footer className="py-7 pl-4 pr-24 text-left text-corpo text-teal-escuro md:px-4 md:text-center">
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
