import { useState, type FormEvent } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { limitesDoPeriodo, periodoValido } from '@/utils/periodos'

export default function PeriodoOperacao({
  periodo,
  aoAplicar,
}: {
  periodo: string
  aoAplicar: (periodo: string) => void
}) {
  const limites = limitesDoPeriodo(periodo)
  const [inicio, setInicio] = useState(limites?.inicio ?? '')
  const [fim, setFim] = useState(limites?.fim ?? '')
  const [erro, setErro] = useState('')
  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!inicio || !fim || !periodoValido(`${inicio}/${fim}`)) {
      setErro('Escolha meses válidos, com o início anterior ou igual ao fim.')
      return
    }
    setErro('')
    aoAplicar(inicio === fim ? inicio : `${inicio}/${fim}`)
  }
  return (
    <details className="rounded-xl border border-borda-leve bg-surface-card px-4 py-3 text-corpo">
      <summary className="w-fit cursor-pointer rounded-sm text-teal-profundo">
        Escolher outro período
      </summary>
      <form
        onSubmit={aplicar}
        className="mt-4 flex flex-wrap items-end gap-3"
        aria-label="Período personalizado"
      >
        <Input
          rotulo="Mês inicial"
          type="month"
          value={inicio}
          onChange={(e) => {
            setInicio(e.target.value)
            setErro('')
          }}
          required
        />
        <Input
          rotulo="Mês final"
          type="month"
          value={fim}
          onChange={(e) => {
            setFim(e.target.value)
            setErro('')
          }}
          required
        />
        <Button type="submit" variante="secundario">
          Aplicar período
        </Button>
        {erro && (
          <p role="alert" className="w-full text-legenda text-perigo-escuro">
            {erro}
          </p>
        )}
      </form>
    </details>
  )
}
