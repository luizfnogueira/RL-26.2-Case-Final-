// Porta do modo seed de backend/app/services/unidade_service.py: duas UCs têm visão 360 detalhada.
import type { Unidade360, Unidades } from '@/types/unidades'
import { duracaoEmMeses } from '@/utils/periodos'
import { fixtures } from './fixtures'
import { erroApi, filtrarRegiao, paginar, verificarCenario, type Registro } from './util'
import { invalido, paginacao, periodo, regiao, texto } from './validacao'

/** UC completa (conta alta, GD) e UC recente (meses nulos, sem GD, leitura estimada). */
export const UCS_DETALHADAS: Record<string, () => Promise<Unidade360>> = {
  'UC-DEMO-001': fixtures.unidade,
  'UC-DEMO-007': fixtures.unidadeRecente,
}
const MESES_JANELA = 12

export async function listarUnidades(params: Registro): Promise<Unidades> {
  const busca = texto(params, 'busca')
  if (busca !== undefined && (busca.trim().length < 3 || busca.trim().length > 100)) {
    throw erroApi(422, 'DADOS_INVALIDOS', 'busca deve ter de 3 a 100 caracteres.')
  }
  const { page, pageSize } = paginacao(params)
  const base = await fixtures.unidades()
  let unidades = filtrarRegiao(base.items, regiao(params))
  if (busca) {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    unidades = unidades.filter(
      (uc) =>
        uc.id_uc.toLocaleLowerCase('pt-BR').includes(termo) ||
        uc.nome_titular.toLocaleLowerCase('pt-BR').includes(termo),
    )
  }
  unidades.sort((a, b) => (a.id_uc < b.id_uc ? -1 : a.id_uc > b.id_uc ? 1 : 0))
  return { ...paginar(unidades, page, pageSize), metadados: base.metadados }
}

export async function detalharUnidade(id: string, params: Registro): Promise<Unidade360> {
  const janela = periodo(params, 'periodo_atual', false)
  if (janela !== undefined && duracaoEmMeses(janela) !== MESES_JANELA) {
    throw invalido(`periodo_atual deve ter ${MESES_JANELA} meses.`)
  }
  verificarCenario(janela)
  const carregar = Object.hasOwn(UCS_DETALHADAS, id) ? UCS_DETALHADAS[id] : undefined
  if (!carregar) {
    throw erroApi(404, 'UC_INEXISTENTE', `Unidade Consumidora '${id}' não disponível no cenário.`)
  }
  return carregar()
}
