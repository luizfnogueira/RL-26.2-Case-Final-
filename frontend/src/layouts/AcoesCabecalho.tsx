import { useState } from 'react'
import { Download } from 'lucide-react'
import MenuConta from '@/auth/MenuConta'
import { gerarAtualizacaoMock } from '@/data/usuario.mock'
import BotaoTema from '@/theme/BotaoTema'
import { formatarAtualizacao } from '@/utils/datas'

/**
 * Canto direito do cabeçalho: frescor dos dados, tema, exportar e usuário. Some no celular
 * (lá o tema e o avatar ficam na barra superior).
 */
export default function AcoesCabecalho({ goldAtualizadaEm }: { goldAtualizadaEm?: string | null }) {
  // Telas integradas fornecem a data da fonte; as demais preservam a demonstração.
  const [atualizacaoMock] = useState(() => formatarAtualizacao(gerarAtualizacaoMock()))
  const atualizadoEm =
    goldAtualizadaEm === undefined
      ? atualizacaoMock
      : goldAtualizadaEm
        ? formatarAtualizacao(goldAtualizadaEm)
        : null

  return (
    <div className="hidden shrink-0 items-center gap-3 md:flex lg:gap-4">
      <p className="flex items-center gap-1.5 text-legenda text-ink-2">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${atualizadoEm ? 'bg-teal' : 'bg-ink-3'}`}
        />
        {atualizadoEm ? (
          <>
            <span className="hidden lg:inline">Dados atualizados</span>
            <span className="lg:hidden">Atualizado</span>
            <strong className="font-medium text-ink">{atualizadoEm}</strong>
          </>
        ) : (
          <span>Atualização não informada</span>
        )}
      </p>
      <BotaoTema />
      <button
        type="button"
        disabled
        aria-label="Exportar"
        title="Exportar (disponível nas telas com dados)"
        className="grid size-9 place-items-center rounded-md border border-borda bg-surface-card text-ink-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-0"
      >
        <Download size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <MenuConta />
    </div>
  )
}
