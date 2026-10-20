from typing import Annotated

from fastapi import APIRouter, Body

from app.routers.common import STUB, respostas
from app.schemas.ia import PedidoInsight, PerguntaIA, RespostaIA
from app.services.stubs import exemplo

router = APIRouter(prefix='/ia', tags=['IA'])


@router.post('', response_model=RespostaIA, summary='Perguntar ao assistente',
             description=STUB + ' Resposta textual fixa do P1, independente da pergunta e dos filtros.',
             responses=respostas('resposta_ia', erros=(422, 500, 503)))
async def perguntar(dados: Annotated[PerguntaIA, Body(openapi_examples={
    'p1': {'value': exemplo('pergunta_ia')}
})]):
    if dados.contexto is None:
        return {**exemplo('resposta_ia'), 'contexto': None, 'indicadores_utilizados': [],
                'resposta': 'Informe o período e os filtros para consultar o cenário simulado.'}
    return exemplo('resposta_ia')


@router.post('/insight', response_model=RespostaIA, summary='Análise automática do dashboard',
             description=STUB + ' Retorna o insight fixo do P1; não executa agente nem recalcula dados.',
             responses=respostas('resposta_insight', erros=(422, 500, 503)))
async def insight(dados: Annotated[PedidoInsight, Body(openapi_examples={
    'p1': {'value': exemplo('pedido_insight')}
})]):
    return exemplo('resposta_insight')
