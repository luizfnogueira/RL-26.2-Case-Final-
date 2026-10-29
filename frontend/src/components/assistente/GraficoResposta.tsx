import { Download } from 'lucide-react'
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

      {comoTabela ? (
        // A tabela da resposta inteira: todas as colunas e linhas, inclusive o que ficou fora do desenho
        <TabelaResposta dados={dados} embutida />
      ) : (
        <Grafico grafico={grafico} formatos={formatos} descricao={descricao} />
      )}

      {(grafico.nota || grafico.omitidos > 0) && (
        <p className="text-legenda text-ink-2">
          {grafico.nota}
          {grafico.nota && grafico.omitidos > 0 && ' '}
          {grafico.omitidos > 0 &&
            `Mais ${grafico.omitidos} ${grafico.omitidos === 1 ? 'item ficou' : 'itens ficaram'} de fora do gráfico; estão em “Ver como tabela” e no CSV.`}
        </p>
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
