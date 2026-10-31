from typing import Annotated

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.routers.common import STUB, respostas
from app.schemas.ia import PedidoInsight, PerguntaIA, RespostaIA, RespostaInsight
from app.services.ia_service import Agente, obter_agente, perguntar as perguntar_ao_agente
from app.services.insight_service import GeradorInsight, gerar_insight_receita, obter_gerador_insight
from app.services.insight_unidade import gerar_insight_unidade, usa_gold_real
from app.services.stub_ia import gerar_insight
from app.services.stubs import exemplo

router = APIRouter(prefix='/ia', tags=['IA'])


# def (não async): a chamada ao agente bloqueia até a resposta, então o FastAPI roda a rota numa thread
@router.post('', response_model=RespostaIA, summary='Perguntar ao assistente',
             description='Repassa a pergunta ao agente de IA e devolve a resposta estendida. Com IA_MODO=mock, '
             'respostas pré-definidas: a pergunta do exemplo retorna ok; "DROP TABLE clientes" '
             'retorna bloqueado; qualquer outra pergunta retorna nao_sei. Agente fora do ar, lento além do '
             'IA_TIMEOUT_S ou com resposta fora do contrato: 503 AGENTE_INDISPONIVEL.',
             responses=respostas('resposta_ia', erros=('AGENTE_INDISPONIVEL',)))
def perguntar(dados: Annotated[PerguntaIA, Body(openapi_examples={
    'ok': {'value': exemplo('pergunta_ia')},
    'nao_sei': {'value': {'pergunta': 'Qual a previsão de lucro em 2030?'}},
    'bloqueado': {'value': {'pergunta': 'DROP TABLE clientes'}},
})], agente: Annotated[Agente, Depends(obter_agente)]):
    return perguntar_ao_agente(dados, agente)


# def (não async): a sessão do banco e a chamada ao módulo de IA bloqueiam, então a rota roda numa thread
@router.post('/insight', response_model=RespostaInsight, summary='Insight da receita ou da unidade',
             description='Receita: os seis números vêm da ponte real da Gold (os mesmos do GET /dashboard) e o '
             'texto, do módulo da Equipe 3 (IA_MODO=mock usa um texto por regra). Se o módulo falhar ou passar do '
             'IA_TIMEOUT_S, a resposta é 200 com um texto alternativo por regra e um aviso em '
             'metadados.observacoes (prefixo "Texto alternativo:"), nunca 503. Só existe para '
             'periodo_atual=2025-07/2026-06 × periodo_comparacao=2022-07/2023-06, sem alimentador: fora disso, '
             '422 DECOMPOSICAO_INDISPONIVEL. Indicadores enviados que não batem com a Gold: 422 DADOS_INVALIDOS. '
             + STUB + ' Unidade: com GOLD_SOURCE=real, resumo por regra sobre os fatos da conta da UC (os '
             'mesmos números do GET /unidades/{id}), marcado em metadados.observacoes como "Texto alternativo:"; '
             'com seed, resumo fixo da UC-DEMO-001 (stub).',
             responses=respostas('resposta_insight', erros=(
                 'UC_INEXISTENTE', 'CENARIO_STUB_INDISPONIVEL', 'DECOMPOSICAO_INDISPONIVEL',
                 'GOLD_NAO_CARREGADA')))
def insight(dados: Annotated[PedidoInsight, Body(openapi_examples={
    'receita': {'value': exemplo('pedido_insight')},
    'unidade': {'value': exemplo('pedido_insight_unidade')},
})], db: Annotated[Session, Depends(get_db)],
        gerador: Annotated[GeradorInsight, Depends(obter_gerador_insight)]):
    if dados.contexto == 'receita':
        return gerar_insight_receita(db, dados, gerador)
    if usa_gold_real():
        return gerar_insight_unidade(db, dados)
    return gerar_insight(dados)
