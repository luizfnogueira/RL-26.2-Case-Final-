import type { OpcoesFiltros } from '@/types/filtros'

/**
 * DADO FICTÍCIO. Domínios dos filtros do cenário de exemplo (os mesmos municípios, bairros,
 * classes e alimentadores dos fixtures do backend). Troque por consulta à API quando houver rota
 * de domínios; hoje o contrato não tem uma.
 */
export const OPCOES_FILTROS_MOCK: OpcoesFiltros = {
  municipios: ['Recife', 'Jaboatão dos Guararapes', 'Olinda'],
  bairros: {
    Recife: ['Boa Viagem', 'Boa Vista', 'Casa Amarela'],
    'Jaboatão dos Guararapes': ['Candeias', 'Piedade'],
    Olinda: ['Casa Caiada', 'Rio Doce'],
  },
  classes: ['Comercial', 'Industrial', 'Residencial'],
  alimentadores: ['ALM-DEMO-001', 'ALM-DEMO-002', 'ALM-DEMO-003', 'ALM-DEMO-004', 'ALM-DEMO-005'],
}
