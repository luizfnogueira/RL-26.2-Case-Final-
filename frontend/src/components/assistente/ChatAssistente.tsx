import { ArrowRight, Lock, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { USUARIO_MOCK } from '@/data/usuario.mock'
import { cx } from '@/utils/cx'
import { useAssistente } from './contexto'
import MensagemAssistente from './MensagemAssistente'
import { PERGUNTAS_DE_TESTE, PERGUNTAS_SUGERIDAS } from './sugestoes'

const LIMITE = 2000
const PRIMEIRO_NOME = USUARIO_MOCK.nome.split(' ')[0]

type Props = {
  /** Painel flutuante (estreito) ou tela /assistente (larga). */
  variante?: 'painel' | 'pagina'
  /** Foca o campo ao montar (abertura do painel). */
  focarAoAbrir?: boolean
}

function CartaoDeTeste({
  icone,
  titulo,
  descricao,
  aoClicar,
  desabilitado,
}: {
  icone: ReactNode
  titulo: string
  descricao: string
  aoClicar: () => void
  desabilitado: boolean
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      className="flex w-full items-center gap-3 rounded-md border border-dashed border-borda px-3.5 py-2.5 text-left hover:bg-surface-sutil disabled:opacity-60"
    >
      <span aria-hidden="true">{icone}</span>
      <span className="min-w-0">
        <span className="block text-corpo font-medium">{titulo}</span>
        <span className="block text-legenda text-ink-2">{descricao}</span>
      </span>
    </button>
  )
}

/** Conversa do Assistente: sugestões, histórico e campo livre, com aviso de somente leitura. */
export default function ChatAssistente({ variante = 'pagina', focarAoAbrir = false }: Props) {
  const { mensagens, enviando, perguntar, tentarNovamente, limpar } = useAssistente()
  const [texto, setTexto] = useState('')
  const idCampo = useId()
  const idAviso = useId()
  const campo = useRef<HTMLTextAreaElement>(null)
  const conversa = useRef<HTMLDivElement>(null)
  const pagina = variante === 'pagina'
  const vazia = mensagens.length === 0

  useEffect(() => {
    if (focarAoAbrir) campo.current?.focus()
  }, [focarAoAbrir])

  // Rola só a conversa (não a página) até a última fala quando chega pergunta ou resposta.
  useEffect(() => {
    const area = conversa.current
    if (area) area.scrollTop = area.scrollHeight
  }, [mensagens])

  // O campo cresce com o texto (Shift+Enter) até um limite, depois rola.
  function ajustarAltura() {
    const elemento = campo.current
    if (!elemento) return
    elemento.style.height = 'auto'
    elemento.style.height = `${Math.min(elemento.scrollHeight, 120)}px`
  }

  function aoDigitar(evento: ChangeEvent<HTMLTextAreaElement>) {
    setTexto(evento.target.value)
    ajustarAltura()
  }

  function enviar(pergunta: string) {
    if (!pergunta.trim() || enviando) return
    perguntar(pergunta)
    setTexto('')
    requestAnimationFrame(ajustarAltura)
    campo.current?.focus()
  }

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    enviar(texto)
  }

  // Enter envia; Shift+Enter quebra a linha.
  function aoTeclar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.key === 'Enter' && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault()
      enviar(texto)
    }
  }

  const podeEnviar = texto.trim().length > 0 && !enviando

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div
        ref={conversa}
        role="log"
        aria-label="Conversa com o assistente"
        aria-live="polite"
        className={cx('flex min-h-0 flex-1 flex-col overflow-y-auto', pagina && 'min-h-[360px]')}
      >
        <div className={cx('flex w-full flex-col gap-4', pagina && 'mx-auto max-w-[760px]')}>
          {vazia ? (
            <>
              <div className="flex flex-col items-center gap-2 pt-2 text-center">
                <span
                  aria-hidden="true"
                  className="mb-2 grid size-16 place-items-center rounded-[18px] bg-azul-300 text-teal-profundo"
                >
                  <Sparkles size={28} strokeWidth={1.5} />
                </span>
                <p className={cx('font-light', pagina ? 'text-display' : 'text-numero')}>
                  Como posso ajudar hoje?
                </p>
                <p className="max-w-md text-corpo text-ink-2">
                  Faça perguntas sobre clientes, receita, perdas ou operação usando suas próprias
                  palavras.
                </p>
              </div>

              <ul
                aria-label="Perguntas sugeridas"
                className={cx('grid gap-2', pagina && 'sm:grid-cols-2')}
              >
                {PERGUNTAS_SUGERIDAS.map((pergunta) => (
                  <li key={pergunta}>
                    <button
                      type="button"
                      onClick={() => enviar(pergunta)}
                      disabled={enviando}
                      className="flex h-full w-full items-center justify-between gap-3 rounded-md border border-borda bg-surface-card px-3.5 py-2.5 text-left text-corpo transition-colors hover:border-teal hover:bg-azul-50 disabled:opacity-60"
                    >
                      {pergunta}
                      <ArrowRight
                        size={16}
                        aria-hidden="true"
                        className="shrink-0 text-teal-escuro"
                      />
                    </button>
                  </li>
                ))}
              </ul>

              <div className={cx('grid gap-2', pagina && 'sm:grid-cols-2')}>
                <CartaoDeTeste
                  icone={
                    <TriangleAlert size={20} strokeWidth={1.5} className="text-alerta-escuro" />
                  }
                  titulo='Testar "Não sei"'
                  descricao="Pergunta sem dados disponíveis"
                  aoClicar={() => enviar(PERGUNTAS_DE_TESTE.naoSei)}
                  desabilitado={enviando}
                />
                <CartaoDeTeste
                  icone={<Lock size={20} strokeWidth={1.5} className="text-perigo-escuro" />}
                  titulo="Testar segurança"
                  descricao="Comando destrutivo bloqueado"
                  aoClicar={() => enviar(PERGUNTAS_DE_TESTE.seguranca)}
                  desabilitado={enviando}
                />
              </div>

              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-azul-100 text-teal-profundo"
                >
                  <Sparkles size={16} strokeWidth={1.75} />
                </span>
                <p className="rounded-[14px] bg-surface-alt px-3.5 py-2.5 text-corpo">
                  Olá, {PRIMEIRO_NOME}. Posso consultar os dados consolidados da V-Energy. O que
                  você gostaria de saber?
                </p>
              </div>
            </>
          ) : (
            mensagens.map((mensagem) =>
              mensagem.autor === 'usuario' ? (
                <p
                  key={mensagem.id}
                  className="w-fit max-w-[85%] rounded-[14px] rounded-bl-xs bg-teal-escuro px-3.5 py-2 text-corpo whitespace-pre-line text-ink-inverso"
                >
                  <span className="sr-only">Você perguntou: </span>
                  {mensagem.texto}
                </p>
              ) : (
                <div key={mensagem.id} className="pr-4">
                  <MensagemAssistente
                    mensagem={mensagem}
                    enviando={enviando}
                    aoTentarNovamente={() => tentarNovamente(mensagem.id)}
                  />
                </div>
              ),
            )
          )}
        </div>
      </div>

      <form
        onSubmit={aoEnviar}
        className={cx(
          'mt-4 w-full rounded-card border border-borda bg-surface-card p-3 md:px-4',
          pagina && 'mx-auto max-w-[760px]',
        )}
      >
        <p
          id={idAviso}
          className="mb-2 inline-flex items-center gap-1.5 text-legenda font-medium text-teal-escuro"
        >
          <Lock size={14} aria-hidden="true" />
          Assistente somente leitura
        </p>
        <label htmlFor={idCampo} className="sr-only">
          Sua pergunta
        </label>
        <div
          className={cx(
            'flex items-center gap-2 rounded-[26px] border py-1.5 pr-1.5 pl-4 transition-colors',
            enviando ? 'border-borda' : 'border-teal-escuro',
          )}
        >
          <textarea
            id={idCampo}
            ref={campo}
            value={texto}
            onChange={aoDigitar}
            onKeyDown={aoTeclar}
            maxLength={LIMITE}
            rows={1}
            aria-describedby={idAviso}
            placeholder="Pergunte sobre os dados da V-Energy…"
            className="max-h-[120px] flex-1 resize-none bg-transparent py-1.5 text-corpo outline-none placeholder:text-ink-3"
          />
          <button
            type="submit"
            aria-label="Enviar"
            disabled={!podeEnviar}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-escuro text-ink-inverso transition-colors hover:bg-teal-profundo disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-ink-3"
          >
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-micro text-ink-2">
          <span>
            As respostas usam apenas dados disponíveis. Quando eu não souber, vou informar
            claramente.
          </span>
          {texto.length > LIMITE - 200 && (
            <span>
              {texto.length}/{LIMITE}
            </span>
          )}
          {!vazia && (
            <button
              type="button"
              onClick={limpar}
              className="inline-flex items-center gap-1 text-legenda text-teal-escuro hover:underline"
            >
              <Trash2 size={12} aria-hidden="true" />
              Limpar conversa
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
