from typing import Annotated

from fastapi import APIRouter, Body, Depends

from app.routers.common import STUB, respostas
from app.schemas.ia import PedidoInsight, PerguntaIA, RespostaIA, RespostaInsight
from app.services.ia_service import Agente, obter_agente, perguntar as perguntar_ao_agente
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


@router.post('/insight', response_model=RespostaInsight, summary='Insight da receita ou da unidade',
             description=STUB + ' Receita: texto gerado sobre os seis números do recorte. '
             'Unidade: resumo fixo da UC-DEMO-001.',
             responses=respostas('resposta_insight', erros=('UC_INEXISTENTE', 'CENARIO_STUB_INDISPONIVEL')))
async def insight(dados: Annotated[PedidoInsight, Body(openapi_examples={
    'receita': {'value': exemplo('pedido_insight')},
    'unidade': {'value': exemplo('pedido_insight_unidade')},
})]):
    return gerar_insight(dados)
