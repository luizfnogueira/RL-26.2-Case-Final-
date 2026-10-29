import { Check, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AvaliacaoIA, DetalhesTecnicos as Detalhes, StatusIA } from '@/types/ia'

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const ETAPAS: Record<string, string> = {
  ss_ms: 'Seleção de skills',
  agente_ms: 'Agente',
  validacao_ms: 'Validação',
}
const STATUS: Record<StatusIA, string> = {
  ok: 'Respondidas',
  nao_sei: 'Não sei',
  bloqueado: 'Bloqueadas',
  esclarecer: 'Esclarecimento pedido',
}

const segundos = (ms: number) => `${numero.format(ms / 1000)} s`
const razao = (valor?: number) => (valor === undefined ? '—' : `${numero.format(valor * 100)}%`)
const simNao = (valor: boolean | null) => (valor === null ? '—' : valor ? 'sim' : 'não')

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-legenda font-medium text-ink">{titulo}</h4>
      {children}
    </section>
  )
}

/** Pares rótulo → valor; valores vazios não aparecem. */
function Pares({ itens }: { itens: [string, ReactNode][] }) {
  const visiveis = itens.filter(
    ([, valor]) => valor !== null && valor !== undefined && valor !== '',
  )
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-legenda">
      {visiveis.map(([rotulo, valor]) => (
        <div key={rotulo} className="contents">
          <dt className="text-ink-2">{rotulo}</dt>
          <dd className="min-w-0 break-words text-ink">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

function Qualidade({ avaliacao }: { avaliacao: AvaliacaoIA | null }) {
  if (!avaliacao) {
    return <p className="text-legenda text-ink-2">Ainda não há avaliação do agente.</p>
  }
  const quando = avaliacao.executado_em
    ? new Date(avaliacao.executado_em).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null
  const porStatus = Object.entries(avaliacao.por_status ?? {}) as [
    StatusIA,
    { precisao: number; recall: number; f1: number },
  ][]
  return (
    <>
      <Pares
        itens={[
          ['Último run', quando],
          ['Perguntas', avaliacao.n_perguntas],
          ['Configuração', avaliacao.configuracao],
          ['Acurácia de execução', razao(avaliacao.acuracia_execucao)],
          ['Taxa de invenção', razao(avaliacao.taxa_invencao)],
          ['Ataques bloqueados', razao(avaliacao.bloqueio_ataques)],
          ['F1 macro', razao(avaliacao.f1_macro)],
        ]}
      />
      {porStatus.length > 0 && (
        <table className="w-full text-legenda">
          <caption className="sr-only">Precisão, recall e F1 por status</caption>
          <thead>
            <tr className="text-ink-2">
              <th scope="col" className="text-left font-normal">
                Status
              </th>
              <th scope="col" className="text-right font-normal">
                Precisão
              </th>
              <th scope="col" className="text-right font-normal">
                Recall
              </th>
              <th scope="col" className="text-right font-normal">
                F1
              </th>
            </tr>
          </thead>
          <tbody>
            {porStatus.map(([status, m]) => (
              <tr key={status}>
                <th scope="row" className="text-left font-normal">
                  {STATUS[status] ?? status}
                </th>
                <td className="text-right">{razao(m.precisao)}</td>
                <td className="text-right">{razao(m.recall)}</td>
                <td className="text-right">{razao(m.f1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-micro text-ink-3">
        Métricas do conjunto de perguntas com gabarito, não desta resposta.
      </p>
    </>
  )
}

/**
 * Painel "Detalhes técnicos" de uma resposta (GENAI-18, 19): o plano e as ações registradas, que podem
 * ser auditados, separados da justificativa, que é só o que o modelo declarou. Tudo vira texto do
 * React: nada da resposta é interpretado como HTML.
 */
export default function DetalhesTecnicos({ detalhes, id }: { detalhes: Detalhes; id: string }) {
  const {
    estrutura_pensamento: pensamento,
    acoes,
    consulta,
    tokens_tempo: uso,
    verificacoes,
  } = detalhes
  const plano = pensamento.plano
  const etapas = Object.entries(uso.etapas_ms ?? {})

  return (
    <div
      id={id}
      className="mt-2 flex max-w-md flex-col gap-3 rounded-md border border-borda bg-surface-card p-3"
    >
      <p className="text-micro tracking-wider text-teal-escuro uppercase">Detalhes técnicos</p>

      <Bloco titulo="Estrutura de pensamento">
        <Pares
          itens={[
            ['Pergunta interpretada', pensamento.pergunta_interpretada],
            ['Tabelas', plano?.tabelas.join(', ')],
            ['Colunas', plano?.colunas.join(', ')],
            ['Filtros', plano?.filtros.join(' · ')],
            ['Agregação', plano?.agregacao],
            ['Ordenação', plano?.ordenacao],
            ['Limite', plano?.limite],
            ['Período', plano?.periodo],
            ['Skills', pensamento.skills.join(', ')],
          ]}
        />
        {pensamento.premissas.length > 0 && (
          <div>
            <p className="text-legenda text-ink-2">Premissas</p>
            <ul className="list-disc pl-4 text-legenda">
              {pensamento.premissas.map((premissa) => (
                <li key={premissa}>{premissa}</li>
              ))}
            </ul>
          </div>
        )}
        {pensamento.justificativa && (
          <p className="text-legenda">
            <span className="text-ink-2">Justificativa declarada pelo modelo (não auditada): </span>
            {pensamento.justificativa}
          </p>
        )}
      </Bloco>

      {acoes.length > 0 && (
        <Bloco titulo="Ações do agente">
          <ol className="flex flex-col gap-1.5 text-legenda">
            {acoes.map((acao) => (
              <li key={acao.ordem} className="flex flex-col gap-0.5">
                <span className="inline-flex items-center gap-1 font-medium">
                  {acao.sucesso ? (
                    <Check size={13} aria-label="sucesso" className="text-teal-escuro" />
                  ) : (
                    <X size={13} aria-label="falhou" className="text-perigo-escuro" />
                  )}
                  {acao.ordem}. {acao.ferramenta}
                </span>
                {typeof acao.argumentos.sql === 'string' ? (
                  <code className="rounded-sm bg-surface-alt px-1.5 py-1 break-words whitespace-pre-wrap">
                    {acao.argumentos.sql}
                  </code>
                ) : (
                  Object.keys(acao.argumentos).length > 0 && (
                    <code className="break-words">{JSON.stringify(acao.argumentos)}</code>
                  )
                )}
                <span className="break-words text-ink-2">{acao.resumo_retorno}</span>
              </li>
            ))}
          </ol>
        </Bloco>
      )}

      <Bloco titulo="Tokens e tempo">
        <Pares
          itens={[
            ['Tokens', `${uso.tokens_entrada} de entrada · ${uso.tokens_saida} de saída`],
            ['Raciocínio', uso.tokens_raciocinio ? `${uso.tokens_raciocinio} tokens` : null],
            ['Chamadas ao modelo', uso.chamadas],
            ['Tentativas de SQL', consulta.tentativas],
            ['Linhas', consulta.linhas],
            ['Tempo total', segundos(uso.latencia_total_ms)],
            ...etapas.map(([etapa, ms]): [string, ReactNode] => [
              ETAPAS[etapa] ?? etapa,
              segundos(ms),
            ]),
            ['Modelo', uso.modelo && `${uso.modelo}${uso.provedor ? ` (${uso.provedor})` : ''}`],
            ['Cache', uso.cache ? 'resposta do cache, sem chamar o modelo' : null],
          ]}
        />
      </Bloco>

      <Bloco titulo="Verificações">
        <Pares
          itens={[
            ['SQL validado', simNao(verificacoes.sql_validado)],
            ['Números conferidos', simNao(verificacoes.numeros_conferidos)],
            ['Confiança', verificacoes.confianca],
          ]}
        />
      </Bloco>

      <Bloco titulo="Qualidade do agente">
        <Qualidade avaliacao={detalhes.avaliacao} />
      </Bloco>
    </div>
  )
}
