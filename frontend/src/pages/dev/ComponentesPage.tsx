import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import BarraDeFiltros from '@/components/filtros/BarraDeFiltros'
import SeletorDeItens from '@/components/filtros/SeletorDeItens'
import { selecaoValida, type SelecaoItens } from '@/components/filtros/selecaoItens'
import Badge, { type VarianteBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Select from '@/components/ui/Select'
import Skeleton from '@/components/ui/Skeleton'
import Tabela, { type Coluna } from '@/components/ui/Tabela'
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl'
import { useOpcoesFiltros } from '@/hooks/useOpcoesFiltros'
import Pagina from '@/layouts/Pagina'
import { ApiError } from '@/services/erro-api'
import type { CampoFiltro, FiltrosUrl } from '@/types/filtros'
import { PERIODO_ATUAL_PADRAO, PERIODO_COMPARACAO_PADRAO } from '@/utils/periodos'

// Galeria de uso dos componentes comuns. Só existe em desenvolvimento (rota /dev/componentes).

const CAMPOS: readonly CampoFiltro[] = [
  'periodo_atual',
  'periodo_comparacao',
  'municipio',
  'bairro',
  'classe',
]
const PADROES: FiltrosUrl = {
  periodo_atual: PERIODO_ATUAL_PADRAO,
  periodo_comparacao: PERIODO_COMPARACAO_PADRAO,
}

interface Linha {
  id: number
  municipio: string
  queda: number
  situacao: VarianteBadge
}

const LINHAS: Linha[] = [
  { id: 1, municipio: 'Recife', queda: 10755649, situacao: 'perigo' },
  { id: 2, municipio: 'Jaboatão dos Guararapes', queda: 4120330, situacao: 'alerta' },
  { id: 3, municipio: 'Olinda', queda: 1980410, situacao: 'info' },
  { id: 4, municipio: 'Paulista', queda: 820000, situacao: 'sucesso' },
  { id: 5, municipio: 'Camaragibe', queda: 610200, situacao: 'neutro' },
]

const COLUNAS: Coluna<Linha>[] = [
  {
    id: 'municipio',
    cabecalho: 'Município',
    celula: (l) => l.municipio,
    ordenavel: true,
    valorOrdenacao: (l) => l.municipio,
  },
  {
    id: 'queda',
    cabecalho: 'Queda (kWh)',
    alinhar: 'direita',
    celula: (l) => l.queda.toLocaleString('pt-BR'),
    ordenavel: true,
    valorOrdenacao: (l) => l.queda,
  },
  {
    id: 'situacao',
    cabecalho: 'Situação',
    celula: (l) => (
      <Badge variante={l.situacao} ponto>
        {l.situacao}
      </Badge>
    ),
  },
]

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card titulo={titulo}>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </Card>
  )
}

export default function ComponentesPage() {
  const opcoesFiltros = useOpcoesFiltros()
  const [modal, setModal] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [classe, setClasse] = useState('')
  const [nome, setNome] = useState('')
  const [selecao, setSelecao] = useState<SelecaoItens>({ nivel: 'municipio', itens: [] })
  const { filtros } = useFiltrosUrl(CAMPOS, PADROES)

  return (
    <Pagina
      titulo="Componentes comuns"
      subtitulo="Galeria de desenvolvimento (F2). Não aparece no build de produção."
    >
      <BarraDeFiltros campos={CAMPOS} padroes={PADROES} opcoes={opcoesFiltros.opcoes} />
      <Card titulo="Estado dos filtros na URL" subtitulo="Recarregue a página: os filtros ficam.">
        <pre className="overflow-x-auto rounded-md bg-surface-alt p-3 text-legenda">
          {JSON.stringify(filtros, null, 2)}
        </pre>
      </Card>

      <Secao titulo="Botões">
        <Button>Primário</Button>
        <Button variante="secundario">Secundário</Button>
        <Button variante="fantasma">Fantasma</Button>
        <Button variante="perigo">Cancelar ordem</Button>
        <Button icone={<Plus size={18} aria-hidden="true" />}>Com ícone</Button>
        <Button
          variante="secundario"
          icone={<Download size={16} aria-hidden="true" />}
          tamanho="sm"
        >
          Pequeno
        </Button>
        <Button carregando>Salvando</Button>
        <Button disabled>Desabilitado</Button>
      </Secao>

      <Secao titulo="Etiquetas">
        {(['neutro', 'info', 'sucesso', 'alerta', 'perigo'] as const).map((v) => (
          <Badge key={v} variante={v} ponto>
            {v}
          </Badge>
        ))}
        <SeloFicticio metadados={{ dados_ficticios: true }} />
      </Secao>

      <Secao titulo="Campos">
        <Input
          rotulo="Buscar UC"
          placeholder="UC-DEMO-001"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          ajuda="ID da UC ou nome do titular"
          className="w-60"
        />
        <Input
          rotulo="Justificativa"
          defaultValue=""
          erro="Obrigatória para cancelar a ordem."
          className="w-60"
        />
        <Select
          rotulo="Classe"
          valor={classe}
          aoMudar={setClasse}
          vazio="Todas"
          opcoes={(opcoesFiltros.opcoes.classes ?? []).map((c) => ({ valor: c, rotulo: c }))}
          className="w-60"
        />
      </Secao>

      <Card titulo="Tabela" subtitulo="Ordenação local pelos cabeçalhos; paginação controlada.">
        <Tabela
          legenda="Municípios com maior queda de consumo"
          colunas={COLUNAS}
          linhas={LINHAS}
          chaveLinha={(l) => l.id}
          paginacao={{ page: pagina, pageSize: 5, total: 47, aoMudar: setPagina }}
          aoClicarLinha={(l) => setNome(l.municipio)}
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card titulo="Carregando">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        </Card>
        <Card titulo="Tabela carregando">
          <Tabela
            legenda="Exemplo"
            colunas={COLUNAS}
            linhas={[]}
            chaveLinha={(l) => l.id}
            carregando
          />
        </Card>
        <Card titulo="Vazio">
          <EmptyState acao={<Button variante="secundario">Limpar filtros</Button>} />
        </Card>
        <Card titulo="Erro">
          <ErrorState
            erro={new ApiError(503, 'ERRO_INTERNO', 'O serviço de dados está indisponível.')}
            aoTentarNovamente={() => undefined}
          />
        </Card>
      </div>

      <Card
        titulo="Seletor de itens"
        subtitulo="Comparação de recortes: de 2 a 4 itens do mesmo nível."
      >
        <SeletorDeItens opcoes={opcoesFiltros.opcoes} valor={selecao} aoMudar={setSelecao} />
        <pre className="mt-3 overflow-x-auto rounded-md bg-surface-alt p-3 text-legenda">
          {JSON.stringify({ ...selecao, valida: selecaoValida(selecao) }, null, 2)}
        </pre>
      </Card>

      <Secao titulo="Modal">
        <Button onClick={() => setModal(true)}>Abrir modal</Button>
      </Secao>
      <Modal
        aberto={modal}
        aoFechar={() => setModal(false)}
        titulo="Cancelar ordem"
        descricao="A ordem volta para a fila e a justificativa fica no histórico."
        rodape={
          <>
            <Button variante="secundario" onClick={() => setModal(false)}>
              Voltar
            </Button>
            <Button variante="perigo" onClick={() => setModal(false)}>
              Cancelar ordem
            </Button>
          </>
        }
      >
        <Input rotulo="Justificativa" data-foco-inicial placeholder="Por que cancelar?" />
      </Modal>
    </Pagina>
  )
}
