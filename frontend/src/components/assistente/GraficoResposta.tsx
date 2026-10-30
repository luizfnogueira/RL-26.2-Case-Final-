import { Download, Info } from 'lucide-react'
import { useState } from 'react'
import Barras from '@/components/graficos/Barras'
import Linhas from '@/components/graficos/Linhas'
import Pizza from '@/components/graficos/Pizza'
import type { DadosIA, GraficoIA } from '@/types/ia'
import { baixarCsv } from './csv'
import { formatosDoGrafico } from './formatosGrafico'
import TabelaResposta from './TabelaResposta'

const NOME_DO_TIPO = { barras: 'barras', pizza: 'pizza', linhas: 'linhas' }

/**
 * Gráfico da resposta (contrato, seção 9), quando a API devolve `apresentacao: "grafico"`. O
 * backend escolhe o tipo e já manda os valores do banco ordenados; aqui só se desenha.
 */
export default function GraficoResposta({ grafico, dados }: { grafico: GraficoIA; dados: DadosIA }) {
  const [comoTabela, setComoTabela] = useState(false)
  const formatos = formatosDoGrafico(grafico)
  const descricao = `${grafico.titulo}. Gráfico de ${NOME_DO_TIPO[grafico.tipo]} com ${grafico.categorias.length} itens.`
  const Grafico = { barras: Barras, pizza: Pizza, linhas: Linhas }[grafico.tipo]

  return (
    <figure className="mt-3 flex flex-col gap-2 rounded-md border border-borda bg-surface-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <figcaption className="text-legenda font-medium text-ink">{grafico.titulo}</figcaption>
        <button
          type="button"
          aria-pressed={comoTabela}
          onClick={() => setComoTabela((v) => !v)}
          className="rounded-full px-3 py-1 text-legenda text-teal-escuro hover:bg-azul-50"
        >
          {comoTabela ? 'Ver gráfico' : 'Ver como tabela'}
        </button>
      </div>

      {/* Antes do desenho: por que o tipo pedido não foi usado e o que ficou de fora (o backend explica) */}
      {(grafico.nota || grafico.omitidos > 0) && (
        <p className="flex items-start gap-1.5 rounded-md bg-azul-50 px-2.5 py-2 text-legenda text-ink">
          <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-teal-escuro" />
          <span>
            {grafico.nota ??
              `Mais ${grafico.omitidos} ${grafico.omitidos === 1 ? 'item ficou' : 'itens ficaram'} de fora do gráfico; estão em “Ver como tabela” e no CSV.`}
          </span>
        </p>
      )}

      {comoTabela ? (
        // A tabela da resposta inteira: todas as colunas e linhas, inclusive o que ficou fora do desenho
        <TabelaResposta dados={dados} embutida />
      ) : (
        <Grafico grafico={grafico} formatos={formatos} descricao={descricao} />
      )}

      <button
        type="button"
        onClick={() => baixarCsv(dados)}
        className="inline-flex w-fit items-center gap-1.5 self-end text-legenda text-teal-escuro hover:underline"
      >
        <Download size={13} aria-hidden="true" />
        Exportar CSV
      </button>
    </figure>
  )
}
