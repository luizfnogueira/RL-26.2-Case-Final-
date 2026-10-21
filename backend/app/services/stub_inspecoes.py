"""Fila e ordens simuladas. Escritas usam o service do Gabriel sobre um snapshot recriado a cada chamada."""
from app.repositories.inspecao_repository import MemoriaOrdemInspecaoRepository
from app.schemas.inspecao import OrdemInspecaoResponse
from app.schemas.inspecoes import FiltrosCandidatos, FiltrosInspecoes
from app.services.inspecao_service import OrdemInspecaoService
from app.services.stubs import (
    PERIODO_ATUAL, cadastro, exemplo, filtrar_regiao, indicador, no_periodo, paginar, verificar_cenario,
)

SCORE_PRIORIZACAO = 60
STATUS = ('ABERTA', 'EM_CAMPO', 'CONCLUIDA', 'CANCELADA')


class RepositorioSnapshot(MemoriaOrdemInspecaoRepository):
    """Repositório em memória carregado com as ordens 1–4 de inspecoes.json; nada persiste."""

    def __init__(self) -> None:
        super().__init__(ucs_iniciais=set(cadastro()))
        ordens = sorted(exemplo('inspecoes')['items'], key=lambda ordem: ordem['id_ordem'])
        for ordem in ordens:
            self.salvar(OrdemInspecaoResponse.model_validate(ordem))
        self._proximo_id_historico = max(h['id_historico'] for o in ordens for h in o['historico']) + 1


def servico_ordens() -> OrdemInspecaoService:
    return OrdemInspecaoService(repository=RepositorioSnapshot())


def para_transporte(ordem: OrdemInspecaoResponse) -> dict:
    # Sem by_alias: a API V2 expõe irregularidade_detectada, não o alias interno.
    return ordem.model_dump(mode='json')


def listar_ordens(filtros: FiltrosInspecoes) -> dict:
    base = exemplo('inspecoes')
    ordens = filtrar_regiao(base['items'], filtros, cadastro())
    if filtros.id_uc is not None:
        ordens = [o for o in ordens if o['id_uc'] == filtros.id_uc]
    if filtros.periodo_atual is not None:
        ordens = [o for o in ordens if no_periodo(o['data_criacao'][:7], filtros.periodo_atual)]
    contagem = {status: sum(o['status'] == status for o in ordens) for status in STATUS}
    if filtros.status is not None:
        ordens = [o for o in ordens if o['status'] == filtros.status]
    ordens.sort(key=lambda o: o['id_ordem'])
    ordens.sort(key=lambda o: o['data_criacao'], reverse=True)
    return {**paginar(ordens, filtros), 'contagem_status': contagem, 'metadados': base['metadados']}


def listar_candidatos(filtros: FiltrosCandidatos) -> dict:
    verificar_cenario(filtros.periodo_atual, filtros.periodo_comparacao)
    base = exemplo('candidatos')
    ativas = {o['id_uc']: o['id_ordem'] for o in exemplo('inspecoes')['items'] if o['status'] in STATUS[:2]}
    candidatos = sorted(filtrar_regiao(base['items'], filtros), key=lambda c: (-c['score'], c['id_uc']))
    for posicao, candidato in enumerate(candidatos, start=1):
        candidato.update(posicao=posicao, ordem_ativa=candidato['id_uc'] in ativas,
                         id_ordem_ativa=ativas.get(candidato['id_uc']))
    priorizados = [c for c in candidatos if c['score'] >= SCORE_PRIORIZACAO]
    resumo = {
        'ucs_analisadas': indicador(len(candidatos), 'UCs', PERIODO_ATUAL),
        'ucs_priorizadas': indicador(len(priorizados), 'UCs', PERIODO_ATUAL),
        'potencial_recuperacao': indicador(
            round(sum(c['energia_estimada']['valor'] for c in priorizados), 2), 'kWh', PERIODO_ATUAL),
        'ordens_ativas': indicador(sum(c['ordem_ativa'] for c in candidatos), 'ordens', PERIODO_ATUAL),
    }
    return {**paginar(candidatos, filtros), 'periodo_referencia': PERIODO_ATUAL,
            'resumo': resumo, 'metadados': base['metadados']}
