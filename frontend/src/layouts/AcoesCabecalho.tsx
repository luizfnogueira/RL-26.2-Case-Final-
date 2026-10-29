import { useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import Avatar from '@/components/common/Avatar'
import { gerarAtualizacaoMock, USUARIO_MOCK } from '@/data/usuario.mock'
import { formatarAtualizacao } from '@/utils/datas'

/**
 * Canto direito do cabeçalho: frescor dos dados, exportar e usuário. Some no celular
 * (lá o avatar fica na barra superior).
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
    <div className="hidden shrink-0 items-center gap-3 md:flex lg:gap-5">
      <p className="flex items-center gap-1.5 text-legenda text-ink-2">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${atualizadoEm ? 'bg-lima-escuro' : 'bg-ink-3'}`}
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
      <button
        type="button"
        disabled
        aria-label="Exportar"
        title="Exportar (disponível nas telas com dados)"
        className="grid size-10 place-items-center rounded-full border border-borda bg-surface-card text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Download size={20} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className="flex items-center gap-2.5">
        <div className="hidden lg:block">
          <p className="text-titulo text-ink">{USUARIO_MOCK.nome}</p>
          <p className="text-corpo text-ink-2">{USUARIO_MOCK.cargo}</p>
        </div>
        <Avatar iniciais={USUARIO_MOCK.iniciais} />
        <ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" className="text-ink-3" />
      </div>
    </div>
  )
}
