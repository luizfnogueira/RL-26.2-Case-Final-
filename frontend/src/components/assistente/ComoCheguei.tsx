import { ChevronRight, ChevronUp, Database } from 'lucide-react'
import { useId, useState } from 'react'
import type { CelulaIA, RespostaIA } from '@/types/ia'

/** Linhas mostradas na minitabela; o resto fica indicado no rodapé. */
const MAX_LINHAS = 8

function celula(valor: CelulaIA): string {
  if (valor === null) return '—'
  if (typeof valor === 'number') return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  return valor
}

/** "energia_estimada_kwh" → "Energia estimada kwh", para o cabeçalho da minitabela. */
function rotulo(coluna: string): string {
  const texto = coluna.replace(/_/g, ' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

type Props = { resposta: Pick<RespostaIA, 'sql' | 'tabelas' | 'dados'> }

/**
 * Auditoria da resposta (SQL, tabelas da Gold e os dados retornados), recolhida por padrão.
 * Mostra só o que a API devolveu; não é o raciocínio interno do agente.
 */
export default function ComoCheguei({ resposta }: Props) {
  const [aberto, setAberto] = useState(false)
  const idConteudo = useId()
  const { sql, tabelas, dados } = resposta
  if (!sql && tabelas.length === 0 && dados.linhas.length === 0) return null
  const linhas = dados.linhas.slice(0, MAX_LINHAS)
  // Coluna numérica (só números ou vazios) alinha à direita, cabeçalho incluído.
  const numerica = dados.colunas.map(
    (_, j) =>
      dados.linhas.some((linha) => typeof linha[j] === 'number') &&
      dados.linhas.every((linha) => typeof linha[j] === 'number' || linha[j] === null),
  )
  const Seta = aberto ? ChevronUp : ChevronRight

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-expanded={aberto}
        aria-controls={idConteudo}
        className="inline-flex items-center gap-1.5 text-corpo text-teal-escuro hover:underline"
      >
        <Database size={15} aria-hidden="true" />
        Como cheguei nisso
        <Seta size={15} aria-hidden="true" />
      </button>

      {aberto && (
        <div
          id={idConteudo}
          className="mt-2 flex max-w-md flex-col gap-3 rounded-md border border-borda bg-surface-card p-3"
        >
          <p className="text-micro tracking-wider text-teal-escuro uppercase">Como cheguei nisso</p>
          {sql && (
            <div>
              <p className="mb-1.5 text-legenda font-medium text-ink">
                Consulta gerada (somente leitura)
              </p>
              <pre className="overflow-x-auto rounded-sm bg-surface-tinta p-3 text-legenda whitespace-pre-wrap break-words text-ink-inverso">
                <code>{sql}</code>
              </pre>
            </div>
          )}
          {tabelas.length > 0 && (
            <div>
              <p className="mb-1.5 text-legenda font-medium text-ink">Tabelas Gold utilizadas</p>
              <ul className="flex flex-wrap gap-1.5">
                {tabelas.map((tabela) => (
                  <li
                    key={tabela}
                    className="rounded-full bg-azul-100 px-2.5 py-0.5 text-legenda text-teal-profundo"
                  >
                    {tabela}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dados.linhas.length > 0 && (
            <div>
              <p className="mb-1.5 text-legenda font-medium text-ink">
                Dados retornados · {dados.linhas.length}{' '}
                {dados.linhas.length === 1 ? 'linha' : 'linhas'}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-legenda">
                  <caption className="sr-only">Dados retornados pela consulta</caption>
                  <thead>
                    <tr className="bg-azul-100 text-teal-profundo">
                      {dados.colunas.map((coluna, j) => (
                        <th
                          key={coluna}
                          scope="col"
                          className={`px-2.5 py-1.5 font-normal ${numerica[j] ? 'text-right' : 'text-left'}`}
                        >
                          {rotulo(coluna)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((linha, i) => (
                      <tr key={i} className="even:bg-surface-sutil">
                        {linha.map((valor, j) => (
                          <td
                            key={j}
                            className={numerica[j] ? 'px-2.5 py-1.5 text-right' : 'px-2.5 py-1.5'}
                          >
                            {celula(valor)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dados.linhas.length > MAX_LINHAS && (
                <p className="mt-1 text-legenda text-ink-3">
                  Mostrando {MAX_LINHAS} de {dados.linhas.length} linhas.
                </p>
              )}
            </div>
          )}
          <p className="text-micro text-ink-3">Consulta somente leitura · dados da camada Gold</p>
        </div>
      )}
    </div>
  )
}
