import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { NivelDrill, ParamsComparacao } from '@/types/dashboard'
import {
  PERIODO_ATUAL_PADRAO,
  PERIODO_COMPARACAO_PADRAO,
  periodoValido,
} from '@/utils/periodos'

export interface EstadoComparacaoUrl {
  aba?: string
  periodo_atual: string
  periodo_comparacao: string
  nivel: NivelDrill
  itens: string[]
  municipio?: string
  bairro?: string
}

export interface ResultadoComparacaoUrl {
  filtros: EstadoComparacaoUrl
  definir: (atualizacao: Partial<ParamsComparacao & { aba?: string }>) => void
  limpar: () => void
  estaAtiva: boolean
}

export function extrairItens(params: URLSearchParams): string[] {
  const valores = params.getAll('itens')
  const itens: string[] = []
  for (const valor of valores) {
    for (const pedaco of valor.split(',')) {
      const limpo = pedaco.trim()
      if (limpo && !itens.includes(limpo)) {
        itens.push(limpo)
      }
    }
  }
  return itens
}

export function construirUrlComparacao(params: {
  aba?: string
  periodo_atual?: string
  periodo_comparacao?: string
  nivel: NivelDrill
  itens: readonly string[]
  municipio?: string
  bairro?: string
}): string {
  const busca = new URLSearchParams()
  busca.set('aba', params.aba ?? 'comparar')
  if (params.periodo_atual) busca.set('periodo_atual', params.periodo_atual)
  if (params.periodo_comparacao) busca.set('periodo_comparacao', params.periodo_comparacao)
  busca.set('nivel', params.nivel)
  if (params.nivel !== 'municipio' && params.municipio) {
    busca.set('municipio', params.municipio)
  }
  if (params.nivel === 'classe' && params.bairro) {
    busca.set('bairro', params.bairro)
  }
  for (const item of params.itens) {
    const limpo = String(item).trim()
    if (limpo) busca.append('itens', limpo)
  }
  const query = busca.toString()
  return `/painel${query ? `?${query}` : ''}`
}

export function useComparacaoUrl(padroes?: Partial<EstadoComparacaoUrl>): ResultadoComparacaoUrl {
  const [params, setParams] = useSearchParams()
  const busca = params.toString()

  const filtros = useMemo<EstadoComparacaoUrl>(() => {
    const p = new URLSearchParams(busca)
    const paBruto = p.get('periodo_atual')?.trim()
    const pcBruto = p.get('periodo_comparacao')?.trim()
    const periodo_atual =
      paBruto && periodoValido(paBruto) ? paBruto : (padroes?.periodo_atual ?? PERIODO_ATUAL_PADRAO)
    const periodo_comparacao =
      pcBruto && periodoValido(pcBruto)
        ? pcBruto
        : (padroes?.periodo_comparacao ?? PERIODO_COMPARACAO_PADRAO)

    const nivelBruto = p.get('nivel')?.trim()
    const nivel: NivelDrill =
      nivelBruto === 'bairro' || nivelBruto === 'classe'
        ? nivelBruto
        : (padroes?.nivel ?? 'municipio')

    const itens = extrairItens(p)
    const municipio = p.get('municipio')?.trim() || padroes?.municipio
    const bairro = p.get('bairro')?.trim() || padroes?.bairro

    const aba = p.get('aba')?.trim() || padroes?.aba

    const resultado: EstadoComparacaoUrl = {
      aba,
      periodo_atual,
      periodo_comparacao,
      nivel,
      itens: itens.length > 0 ? itens : (padroes?.itens ?? []),
    }
    if (nivel !== 'municipio' && municipio) resultado.municipio = municipio
    if (nivel === 'classe' && municipio && bairro) resultado.bairro = bairro
    return resultado
  }, [
    busca,
    padroes?.periodo_atual,
    padroes?.periodo_comparacao,
    padroes?.nivel,
    padroes?.municipio,
    padroes?.bairro,
    padroes?.aba,
    padroes?.itens,
  ])

  const definir = useCallback(
    (atualizacao: Partial<ParamsComparacao & { aba?: string }>) => {
      setParams(
        (atual) => {
          const proximo = new URLSearchParams(atual)
          if ('aba' in atualizacao) {
            if (atualizacao.aba) proximo.set('aba', atualizacao.aba)
            else proximo.delete('aba')
          }
          if ('nivel' in atualizacao) {
            if (atualizacao.nivel) proximo.set('nivel', atualizacao.nivel)
            else proximo.delete('nivel')
          }
          if ('periodo_atual' in atualizacao) {
            if (atualizacao.periodo_atual) proximo.set('periodo_atual', atualizacao.periodo_atual)
            else proximo.delete('periodo_atual')
          }
          if ('periodo_comparacao' in atualizacao) {
            if (atualizacao.periodo_comparacao)
              proximo.set('periodo_comparacao', atualizacao.periodo_comparacao)
            else proximo.delete('periodo_comparacao')
          }
          if ('municipio' in atualizacao) {
            if (atualizacao.municipio) proximo.set('municipio', atualizacao.municipio)
            else proximo.delete('municipio')
          }
          if ('bairro' in atualizacao) {
            if (atualizacao.bairro) proximo.set('bairro', atualizacao.bairro)
            else proximo.delete('bairro')
          }
          if ('itens' in atualizacao) {
            proximo.delete('itens')
            if (Array.isArray(atualizacao.itens)) {
              for (const item of atualizacao.itens) {
                const limpo = String(item).trim()
                if (limpo) proximo.append('itens', limpo)
              }
            }
          }
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
        proximo.delete('aba')
        proximo.delete('nivel')
        proximo.delete('itens')
        proximo.delete('municipio')
        proximo.delete('bairro')
        return proximo
      },
      { replace: true },
    )
  }, [setParams])

  const estaAtiva = filtros.aba === 'comparar'

  return { filtros, definir, limpar, estaAtiva }
}

