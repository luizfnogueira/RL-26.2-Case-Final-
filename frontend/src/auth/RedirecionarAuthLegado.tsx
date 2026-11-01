import { Navigate, useParams, useSearchParams } from 'react-router'
import { destinoSeguro, rotaAuth } from './fluxo'

export default function RedirecionarAuthLegado() {
  const { etapa } = useParams()
  const [params] = useSearchParams()
  return (
    <Navigate
      replace
      to={rotaAuth(
        etapa === 'cadastro' ? 'cadastro' : 'login',
        destinoSeguro(params.get('destino')),
      )}
    />
  )
}
