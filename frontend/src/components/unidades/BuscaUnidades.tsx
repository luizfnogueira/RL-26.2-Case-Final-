import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Search, SearchX, UserSearch } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Input from '@/components/ui/Input'
import SeloFicticio from '@/components/ui/SeloFicticio'
import Tabela, { type Coluna } from '@/components/ui/Tabela'
import { useConsulta } from '@/hooks/useConsulta'
import { buscarUnidades } from '@/services'
import type { Unidade } from '@/types/unidades'
import { formatarNome } from '@/utils/formatacao'

export const MINIMO_BUSCA = 3
const MAXIMO_BUSCA = 100
const POR_PAGINA = 10

const COLUNAS: readonly Coluna<Unidade>[] = [
  {
    id: 'id_uc',
    cabecalho: 'Código da UC',
    celula: (uc) => <strong className="font-medium">{uc.id_uc}</strong>,
  },
  { id: 'titular', cabecalho: 'Titular', celula: (uc) => formatarNome(uc.nome_titular) },
  { id: 'municipio', cabecalho: 'Município', celula: (uc) => formatarNome(uc.municipio) },
  { id: 'bairro', cabecalho: 'Bairro', celula: (uc) => formatarNome(uc.bairro) },
  { id: 'classe', cabecalho: 'Classe', celula: (uc) => formatarNome(uc.classe) },
  { id: 'status', cabecalho: 'Situação', celula: (uc) => formatarNome(uc.status) },
]

const mesmoId = (a: string, b: string) =>
  a.toLocaleUpperCase('pt-BR') === b.toLocaleUpperCase('pt-BR')
const caminhoDaUc = (id: string) => `/unidades/${encodeURIComponent(id)}`

/** Busca da Tela 3 por código da UC ou titular, com o termo e a página na URL. */
export default function BuscaUnidades() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const busca = (params.get('busca') ?? '').trim()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)
  const valida = busca.length >= MINIMO_BUSCA && busca.length <= MAXIMO_BUSCA

  // O campo é um rascunho; acompanha a URL quando ela muda por fora (voltar no navegador).
  const [termo, setTermo] = useState(busca)
  const [buscaDaUrl, setBuscaDaUrl] = useState(busca)
  if (busca !== buscaDaUrl) {
    setBuscaDaUrl(busca)
    setTermo(busca)
  }
  const [erroTermo, setErroTermo] = useState<string>()
  // Só a busca enviada agora abre o detalhe direto: voltar para esta URL mostra a lista.
  const [enviada, setEnviada] = useState<string | null>(null)

  const consulta = useConsulta(
    (sinal) => buscarUnidades({ busca, page, page_size: POR_PAGINA }, sinal),
    [busca, page],
    { habilitada: valida },
  )
  const { dados, erro, carregando } = consulta

  useEffect(() => {
    if (carregando || erro || !dados || enviada === null || !mesmoId(enviada, busca)) return
    const [unica] = dados.items
    if (dados.total === 1 && mesmoId(unica.id_uc, busca)) {
      navigate(caminhoDaUc(unica.id_uc), { replace: true })
    }
  }, [dados, erro, carregando, enviada, busca, navigate])

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const texto = termo.trim()
    if (texto.length < MINIMO_BUSCA) {
      setErroTermo(`Digite ao menos ${MINIMO_BUSCA} caracteres.`)
      return
    }
    setErroTermo(undefined)
    setEnviada(texto)
    setParams({ busca: texto })
  }

  const mudarPagina = (proxima: number) =>
    setParams((atual) => {
      const novo = new URLSearchParams(atual)
      if (proxima > 1) novo.set('page', String(proxima))
      else novo.delete('page')
      return novo
    })

  return (
    <>
      <Card>
        <form
          role="search"
          onSubmit={enviar}
          className="flex flex-col gap-3 md:flex-row md:items-start"
        >
          <Input
            rotulo="Código da UC ou nome do titular"
            placeholder="Ex.: UC100015 ou parte do nome"
            ajuda={`Ao menos ${MINIMO_BUSCA} caracteres. Com o código completo, a visão 360 abre direto.`}
            erro={erroTermo}
            maxLength={MAXIMO_BUSCA}
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value)
              if (erroTermo) setErroTermo(undefined)
            }}
            className="md:min-w-96"
          />
          <Button type="submit" icone={<Search size={16} />} className="md:mt-7">
            Buscar
          </Button>
        </form>
      </Card>

      {!valida ? (
        <Card>
          <EmptyState
            icone={<UserSearch size={26} strokeWidth={1.5} />}
            titulo="Busque uma unidade consumidora"
            descricao="Digite o código da UC ou parte do nome do titular para abrir a visão 360."
          />
        </Card>
      ) : erro ? (
        <ErrorState
          erro={erro}
          aoTentarNovamente={consulta.recarregar}
          className="rounded-card bg-surface-card shadow-card"
        />
      ) : (
        <Card
          titulo="Resultados"
          subtitulo={
            dados && !carregando
              ? `${dados.total} ${dados.total === 1 ? 'unidade encontrada' : 'unidades encontradas'} para “${busca}”`
              : `Buscando “${busca}”…`
          }
        >
          <Tabela
            legenda={`Unidades consumidoras encontradas para ${busca}`}
            colunas={COLUNAS}
            linhas={dados?.items ?? []}
            chaveLinha={(uc) => uc.id_uc}
            aoClicarLinha={(uc) => navigate(caminhoDaUc(uc.id_uc))}
            carregando={carregando}
            paginacao={
              dados
                ? {
                    page: dados.page,
                    pageSize: dados.page_size,
                    total: dados.total,
                    aoMudar: mudarPagina,
                  }
                : undefined
            }
            vazio={
              <EmptyState
                icone={<SearchX size={26} strokeWidth={1.5} />}
                titulo="Nenhuma unidade encontrada"
                descricao={`Nada encontrado para “${busca}”. Confira o código ou tente parte do nome do titular.`}
              />
            }
          />
          {dados && (
            <p className="mt-3 flex items-center gap-2 text-legenda text-ink-2">
              <SeloFicticio metadados={dados.metadados} />
              {dados.metadados.observacoes.at(0)}
            </p>
          )}
        </Card>
      )}
    </>
  )
}
