import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { CampoFiltro, FiltrosUrl } from '@/types/filtros'
import { periodoValido } from '@/utils/periodos'

const CAMPOS_DE_PERIODO: readonly CampoFiltro[] = ['periodo_atual', 'periodo_comparacao']

function lerFiltros(
  busca: string,
  campos: readonly CampoFiltro[],
  padroes: FiltrosUrl,
): FiltrosUrl {
  const params = new URLSearchParams(busca)
  const filtros: FiltrosUrl = {}
  for (const campo of campos) {
    const bruto = params.get(campo)?.trim()
    // Período inválido na URL (link antigo, edição à mão) cai no padrão em vez de virar erro 422.
    const aproveitavel = bruto && (!CAMPOS_DE_PERIODO.includes(campo) || periodoValido(bruto))
    const valor = aproveitavel ? bruto : padroes[campo]
    if (valor) filtros[campo] = valor
  }
  // Contrato: bairro exige município.
  if (filtros.bairro && !filtros.municipio) delete filtros.bairro
  return filtros
}

export interface ResultadoFiltrosUrl {
  /** Valores efetivos (URL ou padrão). A identidade só muda quando algum valor muda. */
  filtros: FiltrosUrl
  /** Aplica os valores informados; string vazia remove o filtro. Volta à página 1. */
  definir: (parcial: FiltrosUrl) => void
  /** Remove todos os filtros deste conjunto, voltando aos padrões. */
  limpar: () => void
  /** true se algum filtro difere do padrão. */
  alterados: boolean
}

/**
 * Filtros da tela guardados na query string, com os mesmos nomes dos parâmetros da API.
 * Recarregar a página, voltar no navegador ou compartilhar o link preservam o estado.
 *
 * @example
 * const { filtros } = useFiltrosUrl(CAMPOS, PADROES)
 * const { dados } = useConsulta((s) => buscarDashboard({ ...PADROES, ...filtros }, s), [filtros])
 */
export function useFiltrosUrl(
  campos: readonly CampoFiltro[],
  padroes: FiltrosUrl = {},
): ResultadoFiltrosUrl {
  const [params, setParams] = useSearchParams()
  const busca = params.toString()
  // Chaves em texto: quem chama pode passar literais novos a cada render sem recriar `filtros`.
  const chaveCampos = campos.join(',')
  const chavePadroes = JSON.stringify(padroes)

  const filtros = useMemo(
    () =>
      lerFiltros(
        busca,
        chaveCampos.split(',').filter(Boolean) as CampoFiltro[],
        JSON.parse(chavePadroes) as FiltrosUrl,
      ),
    [busca, chaveCampos, chavePadroes],
  )

  const definir = useCallback(
    (parcial: FiltrosUrl) => {
      setParams(
        (atual) => {
          const proximo = new URLSearchParams(atual)
          for (const campo of Object.keys(parcial) as CampoFiltro[]) {
            const valor = parcial[campo]?.trim()
            if (valor) proximo.set(campo, valor)
            else proximo.delete(campo)
          }
          // Trocar o município invalida o bairro e o alimentador escolhidos antes: os dois
          // pertencem ao município no cadastro da Gold.
          const trocouMunicipio =
            'municipio' in parcial && (parcial.municipio ?? '') !== (atual.get('municipio') ?? '')
          if (trocouMunicipio && !('bairro' in parcial)) proximo.delete('bairro')
          if (trocouMunicipio && !('alimentador' in parcial)) proximo.delete('alimentador')
          if (!proximo.get('municipio')) {
            proximo.delete('bairro')
            proximo.delete('alimentador')
          }
          proximo.delete('page')
          return proximo
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const limpar = useCallback(() => {
    setParams(
      (atual) => {
        const proximo = new URLSearchParams(atual)
        for (const campo of chaveCampos.split(',').filter(Boolean)) proximo.delete(campo)
        proximo.delete('page')
        return proximo
      },
      { replace: true },
    )
  }, [setParams, chaveCampos])

  const alterados = useMemo(() => {
    const padrao = JSON.parse(chavePadroes) as FiltrosUrl
    return chaveCampos
      .split(',')
      .filter(Boolean)
      .some(
        (campo) => (filtros[campo as CampoFiltro] ?? '') !== (padrao[campo as CampoFiltro] ?? ''),
      )
  }, [filtros, chaveCampos, chavePadroes])

  return { filtros, definir, limpar, alterados }
}
