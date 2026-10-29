import { useState } from 'react'
import { CalendarCheck, ChartColumn, Headset, Table2, ZapOff } from 'lucide-react'
import BarrasComparadas from '@/components/graficos/BarrasComparadas'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Tabela, { type Coluna } from '@/components/ui/Tabela'
import type { Periodo } from '@/types/comum'
import type { Chamado, ConsumoMes, Fatura, Interrupcao } from '@/types/unidades'
import { formatarData, formatarDataHora, formatarDuracao } from '@/utils/datas'
import {
  formatarEnergia,
  formatarIndicador,
  formatarNome,
  formatarReaisCompleto,
} from '@/utils/formatacao'
import { formatarMes, limitesDoPeriodo } from '@/utils/periodos'
import { pontosDoConsumo } from './consumo'
import {
  LARGURAS_CHAMADOS,
  LARGURAS_CONSUMO,
  LARGURAS_FATURAS,
  LARGURAS_INTERRUPCOES,
  RECUO_QUARTA_COLUNA,
  TABELA_PROPORCIONAL,
} from './larguras'

// Consumo e faturas: a 4ª coluna (texto) vem depois de um número alinhado à direita.
const TABELA_COM_RECUO = `${TABELA_PROPORCIONAL} ${RECUO_QUARTA_COLUNA}`

const uma = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function SeloLeitura({ tipo }: { tipo: ConsumoMes['tipo_leitura'] }) {
  if (tipo === null) return <span className="text-ink-2">Sem dado</span>
  // Como no medidor: só a leitura estimada leva selo.
  return tipo === 'ESTIMADA' ? <Badge variante="alerta">Estimada</Badge> : <>{formatarNome(tipo)}</>
}

const COLUNAS_CONSUMO: readonly Coluna<ConsumoMes>[] = [
  { id: 'mes', cabecalho: 'Mês', largura: LARGURAS_CONSUMO.mes, celula: (m) => formatarMes(m.mes) },
  {
    id: 'atual',
    cabecalho: 'Consumo',
    alinhar: 'direita',
    largura: LARGURAS_CONSUMO.consumo,
    celula: (m) => formatarIndicador(m.atual),
  },
  {
    id: 'anterior',
    cabecalho: 'Mesmo mês do ano anterior',
    alinhar: 'direita',
    largura: LARGURAS_CONSUMO.anterior,
    celula: (m) => formatarIndicador(m.ano_anterior),
  },
  {
    id: 'leitura',
    cabecalho: 'Leitura',
    largura: LARGURAS_CONSUMO.leitura,
    celula: (m) => <SeloLeitura tipo={m.tipo_leitura} />,
  },
]

/** Bloco 2: os 12 meses lado a lado com o ano anterior, em gráfico ou tabela. */
export function BlocoConsumo({ consumo }: { consumo: readonly ConsumoMes[] }) {
  const [comoTabela, setComoTabela] = useState(false)
  return (
    <Card
      titulo="Consumo dos últimos 12 meses"
      subtitulo="Cada mês ao lado do mesmo mês do ano anterior"
      aria-label="Consumo dos últimos 12 meses"
      acoes={
        <Button
          variante="fantasma"
          tamanho="sm"
          aria-pressed={comoTabela}
          onClick={() => setComoTabela(!comoTabela)}
          icone={comoTabela ? <ChartColumn size={16} /> : <Table2 size={16} />}
        >
          {comoTabela ? 'Ver gráfico' : 'Ver como tabela'}
        </Button>
      }
    >
      {comoTabela ? (
        <Tabela
          legenda="Consumo mensal comparado ao mesmo mês do ano anterior"
          colunas={COLUNAS_CONSUMO}
          linhas={consumo}
          chaveLinha={(m) => m.mes}
          className={TABELA_COM_RECUO}
        />
      ) : (
        <BarrasComparadas
          pontos={pontosDoConsumo(consumo)}
          nomeAtual="Consumo do mês"
          nomeAnterior="Mesmo mês do ano anterior"
          formatarValor={formatarEnergia}
          descricao="Consumo de cada um dos 12 meses ao lado do mesmo mês do ano anterior, em kWh"
          legendaAviso={
            consumo.some((m) => m.tipo_leitura === 'ESTIMADA')
              ? '“estimada”: leitura estimada no mês'
              : undefined
          }
        />
      )}
    </Card>
  )
}

const colunaMes: Coluna<Fatura> = {
  id: 'mes',
  cabecalho: 'Referência',
  largura: LARGURAS_FATURAS.referencia,
  celula: (f) => formatarMes(f.mes_referencia),
}
const colunaValor: Coluna<Fatura> = {
  id: 'valor',
  cabecalho: 'Valor total',
  alinhar: 'direita',
  largura: LARGURAS_FATURAS.valor,
  celula: (f) => formatarReaisCompleto(f.valor_total),
}
const colunaBandeira: Coluna<Fatura> = {
  id: 'bandeira',
  cabecalho: 'Bandeira',
  largura: LARGURAS_FATURAS.bandeira,
  celula: (f) => formatarNome(f.bandeira_tarifaria),
}

/** Bloco 4: faturas em aberto (de qualquer mês) e pagas no período. */
export function BlocoFaturas({
  abertas,
  pagas,
  periodo,
}: {
  abertas: readonly Fatura[]
  pagas: readonly Fatura[]
  periodo: Periodo
}) {
  const inicio = limitesDoPeriodo(periodo)?.inicio
  const colunasAbertas: readonly Coluna<Fatura>[] = [
    {
      ...colunaMes,
      celula: (f) => (
        <span className="flex flex-wrap items-center gap-2">
          {formatarMes(f.mes_referencia)}
          {/* Em aberto não tem filtro de período: a dívida antiga aparece e é sinalizada. */}
          {inicio && f.mes_referencia < inicio && <Badge variante="alerta">Antes do período</Badge>}
        </span>
      ),
    },
    {
      id: 'vencimento',
      cabecalho: 'Vencimento',
      largura: LARGURAS_FATURAS.data,
      celula: (f) => formatarData(f.data_vencimento),
    },
    colunaValor,
    colunaBandeira,
  ]
  const colunasPagas: readonly Coluna<Fatura>[] = [
    colunaMes,
    {
      id: 'pagamento',
      cabecalho: 'Pago em',
      largura: LARGURAS_FATURAS.data,
      celula: (f) => formatarData(f.data_pagamento ?? ''),
    },
    colunaValor,
    colunaBandeira,
  ]
  return (
    <Card titulo="Faturas" aria-label="Faturas">
      <h3 className="mb-2 text-titulo font-normal">
        Em aberto <span className="text-ink-2">({abertas.length})</span>
      </h3>
      <Tabela
        legenda="Faturas em aberto"
        colunas={colunasAbertas}
        linhas={abertas}
        chaveLinha={(f) => f.id_fatura}
        className={TABELA_COM_RECUO}
        vazio={
          <EmptyState
            icone={<CalendarCheck size={26} strokeWidth={1.5} />}
            titulo="Nenhuma fatura em aberto"
            descricao="O cliente não tem faturas pendentes."
          />
        }
      />
      <h3 className="mt-6 mb-2 text-titulo font-normal">
        Pagas no período <span className="text-ink-2">({pagas.length})</span>
      </h3>
      <Tabela
        legenda="Faturas pagas no período"
        colunas={colunasPagas}
        linhas={pagas}
        chaveLinha={(f) => f.id_fatura}
        className={TABELA_COM_RECUO}
        vazio={
          <EmptyState
            titulo="Nenhuma fatura paga no período"
            descricao="Não há pagamentos registrados nos meses analisados."
          />
        }
      />
    </Card>
  )
}

const COLUNAS_INTERRUPCOES: readonly Coluna<Interrupcao>[] = [
  {
    id: 'inicio',
    cabecalho: 'Início',
    largura: LARGURAS_INTERRUPCOES.inicio,
    celula: (i) => formatarDataHora(i.data_abertura),
  },
  {
    id: 'duracao',
    cabecalho: 'Duração',
    largura: LARGURAS_INTERRUPCOES.duracao,
    celula: (i) => formatarDuracao(i.duracao_min),
  },
  {
    id: 'tipo',
    cabecalho: 'Tipo',
    largura: LARGURAS_INTERRUPCOES.tipo,
    celula: (i) => formatarNome(i.tipo),
  },
  {
    id: 'causa',
    cabecalho: 'Causa',
    largura: LARGURAS_INTERRUPCOES.causa,
    celula: (i) => formatarNome(i.causa),
  },
  {
    id: 'alimentador',
    cabecalho: 'Alimentador',
    largura: LARGURAS_INTERRUPCOES.alimentador,
    celula: (i) => i.alimentador,
  },
]

/** Bloco 8: interrupções do período, com as mesmas regras do DEC (até 10 e o total). */
export function BlocoInterrupcoes({
  recentes,
  total,
}: {
  recentes: readonly Interrupcao[]
  total: number | null
}) {
  const quantidade = total ?? recentes.length
  return (
    <Card
      titulo="Interrupções de energia"
      subtitulo={
        quantidade > 0
          ? `${recentes.length} mais recentes de ${quantidade} no período`
          : 'Nenhuma no período'
      }
      aria-label="Interrupções de energia"
    >
      <Tabela
        legenda="Interrupções de energia mais recentes"
        colunas={COLUNAS_INTERRUPCOES}
        linhas={recentes}
        chaveLinha={(i) => i.id_ocorrencia}
        className={TABELA_PROPORCIONAL}
        vazio={
          <EmptyState
            icone={<ZapOff size={26} strokeWidth={1.5} />}
            titulo="Nenhuma interrupção no período"
            descricao="Não houve falta de energia registrada para esta unidade nos meses analisados."
          />
        }
      />
      <p className="mt-3 text-legenda text-ink-2">
        Mesmas regras do DEC: sem oscilação, só a partir de 3 minutos; a duração desconta o tempo
        sobreposto a outra interrupção.
      </p>
    </Card>
  )
}

const COLUNAS_CHAMADOS: readonly Coluna<Chamado>[] = [
  {
    id: 'abertura',
    cabecalho: 'Aberto em',
    largura: LARGURAS_CHAMADOS.abertura,
    celula: (c) => formatarDataHora(c.data_abertura),
  },
  {
    id: 'canal',
    cabecalho: 'Canal',
    largura: LARGURAS_CHAMADOS.canal,
    celula: (c) => formatarNome(c.canal),
  },
  {
    id: 'assunto',
    cabecalho: 'Assunto',
    largura: LARGURAS_CHAMADOS.assunto,
    celula: (c) => `${formatarNome(c.assunto)} · ${formatarNome(c.subassunto)}`,
  },
  {
    id: 'tempo',
    cabecalho: 'Tempo de atendimento',
    alinhar: 'direita',
    largura: LARGURAS_CHAMADOS.tempo,
    celula: (c) => `${uma.format(c.tempo_atendimento_h)} h`,
  },
  {
    id: 'nota',
    cabecalho: 'Nota',
    alinhar: 'direita',
    largura: LARGURAS_CHAMADOS.nota,
    // Nota não preenchida: "Sem nota", nunca 0.
    celula: (c) =>
      c.nota_satisfacao === null ? (
        <span className="text-ink-2">Sem nota</span>
      ) : (
        uma.format(c.nota_satisfacao)
      ),
  },
]

/** Bloco 9: chamados do cliente com tempo de atendimento e nota. */
export function BlocoChamados({ chamados }: { chamados: readonly Chamado[] }) {
  return (
    <Card
      titulo="Chamados"
      subtitulo={`${chamados.length} ${chamados.length === 1 ? 'chamado' : 'chamados'}`}
      aria-label="Chamados"
    >
      <Tabela
        legenda="Chamados da unidade"
        colunas={COLUNAS_CHAMADOS}
        linhas={chamados}
        chaveLinha={(c) => c.protocolo}
        className={TABELA_PROPORCIONAL}
        vazio={
          <EmptyState
            icone={<Headset size={26} strokeWidth={1.5} />}
            titulo="Nenhum chamado"
            descricao="O cliente não abriu chamados."
          />
        }
      />
    </Card>
  )
}
