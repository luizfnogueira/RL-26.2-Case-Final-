import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import Tabela, { type Coluna, type Ordenacao } from '@/components/ui/Tabela'
import type { CelulaIA, DadosIA } from '@/types/ia'
import { formatarNome, formatarReaisCompleto } from '@/utils/formatacao'
import { baixarCsv } from './csv'

const POR_PAGINA = 10
const duasCasas = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
// Sinal de menos tipográfico (U+2212), como o resto do portal (utils/formatacao).
const numero = (v: number) => duasCasas.format(v).replace(/^-/, '−')

/** Unidade pelo sufixo do alias que o agente usa no SQL (GENAI-14.2): receita_energia_brl, consumo_kwh… */
const UNIDADES = [
  { sufixo: '_brl', rotulo: 'R$', formatar: (v: number) => formatarReaisCompleto(v) },
  { sufixo: '_kwh', rotulo: 'kWh', formatar: (v: number) => `${numero(v)} kWh` },
  { sufixo: '_pct', rotulo: '%', formatar: (v: number) => `${numero(v)}%` },
]
// Município, bairro e classe vêm em maiúsculas da Gold; códigos (id_uc, alimentador) ficam como estão.
const COLUNA_DE_NOME = /(^|_)(municipio|bairro|classe)(_|$)/

function unidadeDa(coluna: string) {
  return UNIDADES.find((u) => coluna.endsWith(u.sufixo))
}

/** "receita_energia_brl" → "Receita energia (R$)". */
function cabecalho(coluna: string): string {
  const unidade = unidadeDa(coluna)
  const base = (unidade ? coluna.slice(0, -unidade.sufixo.length) : coluna).replace(/_/g, ' ')
  const texto = base.charAt(0).toUpperCase() + base.slice(1)
  return unidade ? `${texto} (${unidade.rotulo})` : texto
}

function celula(coluna: string, valor: CelulaIA): string {
  if (valor === null) return '—'
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  if (typeof valor === 'number') return unidadeDa(coluna)?.formatar(valor) ?? numero(valor)
  return COLUNA_DE_NOME.test(coluna) ? formatarNome(valor) : valor
}

type Linha = { i: number; valores: CelulaIA[] }

/**
 * Resposta em tabela no corpo da conversa (GENAI-15), quando a API devolve `apresentacao: "tabela"`.
 * Ordena todas as linhas e pagina de 10 em 10 aqui mesmo; a minitabela do "Como cheguei nisso" continua.
 * `embutida`: dentro do cartão do gráfico ("Ver como tabela"), sem moldura nem CSV próprios.
 */
export default function TabelaResposta({ dados, embutida = false }: { dados: DadosIA; embutida?: boolean }) {
  const [ordenacao, setOrdenacao] = useState<Ordenacao | null>(null)
  const [pagina, setPagina] = useState(1)

  const colunas = useMemo<Coluna<Linha>[]>(
    () =>
      dados.colunas.map((coluna, j) => ({
        id: String(j),
        cabecalho: cabecalho(coluna),
        celula: (linha) => celula(coluna, linha.valores[j]),
        alinhar: dados.linhas.some((l) => typeof l[j] === 'number') ? 'direita' : 'esquerda',
        ordenavel: true,
      })),
    [dados],
  )

  const ordenadas = useMemo(() => {
    const linhas = dados.linhas.map((valores, i) => ({ i, valores }))
    if (!ordenacao) return linhas
    const j = Number(ordenacao.coluna)
    const sinal = ordenacao.direcao === 'asc' ? 1 : -1
    return linhas.sort((a, b) => {
      const [x, y] = [a.valores[j], b.valores[j]]
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
      const ordem =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : collator.compare(String(x), String(y))
      return sinal * ordem
    })
  }, [dados, ordenacao])

  const visiveis = ordenadas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  return (
    <div
      className={
        embutida ? 'flex flex-col gap-2' : 'mt-3 flex flex-col gap-2 rounded-md border border-borda bg-surface-card p-2'
      }
    >
      <Tabela
        colunas={colunas}
        linhas={visiveis}
        chaveLinha={(linha) => linha.i}
        legenda="Resposta do assistente em tabela"
        ordenacao={ordenacao}
        aoOrdenar={(nova) => {
          setOrdenacao(nova)
          setPagina(1)
        }}
        paginacao={
          dados.linhas.length > POR_PAGINA
            ? { page: pagina, pageSize: POR_PAGINA, total: dados.linhas.length, aoMudar: setPagina }
            : undefined
        }
      />
      {!embutida && (
        <button
          type="button"
          onClick={() => baixarCsv(dados)}
          className="inline-flex w-fit items-center gap-1.5 self-end text-legenda text-teal-escuro hover:underline"
        >
          <Download size={13} aria-hidden="true" />
          Exportar CSV
        </button>
      )}
    </div>
  )
}
