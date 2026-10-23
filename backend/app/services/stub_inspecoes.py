from app.schemas.inspecoes import FiltrosCandidatos
from app.services.stubs import (
    PERIODO_ATUAL, exemplo, filtrar_regiao, indicador, paginar, verificar_cenario,
)

STATUS_ATIVOS = ('ABERTA', 'EM_CAMPO')


def listar_candidatos(filtros: FiltrosCandidatos) -> dict:
    verificar_cenario(filtros.periodo_atual, filtros.periodo_comparacao)
    base = exemplo('candidatos')
    ativas = {o['id_uc']: o['id_ordem'] for o in exemplo('inspecoes')['items'] if o['status'] in STATUS_ATIVOS}
    # Mesma ordem de gold.tb_fila_perdas: score, kWh estimado e id_uc.
    candidatos = sorted(filtrar_regiao(base['items'], filtros),
                        key=lambda c: (-c['score'], -c['energia_estimada']['valor'], c['id_uc']))
    for posicao, candidato in enumerate(candidatos, start=1):
        candidato.update(posicao=posicao, ordem_ativa=candidato['id_uc'] in ativas,
                         id_ordem_ativa=ativas.get(candidato['id_uc']))
    # Como na Gold: analisadas = UCs do cadastro (universo da auditoria); priorizadas = UCs na fila (elegíveis)
    analisadas = filtrar_regiao(exemplo('unidades')['items'], filtros)
    priorizados = candidatos
    resumo = {
        'ucs_analisadas': indicador(len(analisadas), 'UCs', PERIODO_ATUAL),
        'ucs_priorizadas': indicador(len(priorizados), 'UCs', PERIODO_ATUAL),
        'potencial_recuperacao': indicador(
            round(sum(c['energia_estimada']['valor'] for c in priorizados), 2), 'kWh', PERIODO_ATUAL),
        'ordens_ativas': indicador(sum(c['ordem_ativa'] for c in candidatos), 'ordens', PERIODO_ATUAL),
    }
    return {**paginar(candidatos, filtros), 'periodo_referencia': PERIODO_ATUAL,
            'resumo': resumo, 'metadados': base['metadados']}
