from typing import Annotated

from fastapi import APIRouter, Body

from app.routers.common import STUB, respostas
from app.schemas.ia import PedidoInsight, PerguntaIA, RespostaIA, RespostaInsight
from app.services.stub_ia import gerar_insight, responder
from app.services.stubs import exemplo

router = APIRouter(prefix='/ia', tags=['IA'])


@router.post('', response_model=RespostaIA, summary='Perguntar ao assistente',
             description=STUB + ' Respostas pré-definidas: a pergunta e o contexto do exemplo retornam ok; '
             '"DROP TABLE clientes" retorna bloqueado; qualquer outra pergunta retorna nao_sei.',
             responses=respostas('resposta_ia'))
async def perguntar(dados: Annotated[PerguntaIA, Body(openapi_examples={
    'ok': {'value': exemplo('pergunta_ia')},
    'nao_sei': {'value': {'pergunta': 'Qual a previsão de lucro em 2030?'}},
    'bloqueado': {'value': {'pergunta': 'DROP TABLE clientes'}},
})]):
    return responder(dados)


@router.post('/insight', response_model=RespostaInsight, summary='Insight da receita ou da unidade',
             description=STUB + ' Receita: texto gerado sobre os seis números do recorte. '
             'Unidade: resumo fixo da UC-DEMO-001.',
             responses=respostas('resposta_insight', erros=('UC_INEXISTENTE', 'CENARIO_STUB_INDISPONIVEL')))
async def insight(dados: Annotated[PedidoInsight, Body(openapi_examples={
    'receita': {'value': exemplo('pedido_insight')},
    'unidade': {'value': exemplo('pedido_insight_unidade')},
})]):
    return gerar_insight(dados)
