from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, Query

from app.routers.common import STUB, respostas
from app.schemas.common import Pagina
from app.schemas.inspecoes import (
    AtualizarInspecao, Candidatos, CriarInspecao, FiltrosCandidatos, FiltrosInspecoes, Ordem,
)
from app.services.stubs import exemplo, paginar, verificar_id

router = APIRouter(prefix='/inspecoes', tags=['Inspeções'])


@router.get('/candidatos', response_model=Candidatos, summary='Fila de candidatos',
            description=STUB + ' Filtros e paginação sobre o exemplo; comparação não recalcula a análise.',
            responses=respostas('candidatos', erros=(422, 500, 503)))
async def candidatos(filtros: Annotated[FiltrosCandidatos, Query()]):
    payload = paginar(exemplo('candidatos'), filtros)
    if filtros.periodo_atual != payload['periodo_referencia']:
        payload.update(periodo_referencia=filtros.periodo_atual, status_analise='indisponivel',
                       motivo_indisponibilidade='DADOS_INDISPONIVEIS')
    return payload


@router.get('', response_model=Pagina[Ordem], summary='Listar ordens de inspeção',
            description=STUB + ' Filtros e paginação aplicados à ordem de exemplo.',
            responses=respostas('inspecoes'))
async def listar_inspecoes(filtros: Annotated[FiltrosInspecoes, Query()]):
    return paginar(exemplo('inspecoes'), filtros, exemplo('unidades')['items'][0])


@router.post('', response_model=Ordem, status_code=201, summary='Simular criação de ordem',
             description=STUB + ' Aceita UC-DEMO-001. Não consulta duplicidade de ordens ativas.',
             responses=respostas('ordem_criada', status=201, erros=(404, 422, 500)))
async def criar_inspecao(dados: Annotated[CriarInspecao, Body(openapi_examples={
    'p1': {'summary': 'Exemplo do P1', 'value': exemplo('criar_inspecao')}
})]):
    verificar_id(dados.id_uc, 'UC-DEMO-001', 'UNIDADE_NAO_ENCONTRADA', 'A unidade solicitada não foi encontrada.')
    payload = exemplo('ordem_criada')
    payload.update(id_uc=dados.id_uc, motivo=dados.motivo)
    return payload


@router.patch('/{id}', response_model=Ordem, summary='Simular atualização da ordem',
              description=STUB + ' Aceita OS-DEMO-001. Início/cancelamento simulam ordem aberta; '
              'conclusão simula ordem previamente em andamento. Não há estado entre chamadas.',
              responses=respostas('ordem_atualizada', erros=(404, 409, 422, 500)))
async def atualizar_inspecao(id: str, dados: Annotated[AtualizarInspecao, Body(openapi_examples={
    'iniciar': {'value': exemplo('iniciar_inspecao')},
    'concluir': {'value': exemplo('concluir_inspecao')},
    'cancelar': {'value': exemplo('cancelar_inspecao')},
})]):
    verificar_id(id, 'OS-DEMO-001', 'ORDEM_NAO_ENCONTRADA', 'A ordem solicitada não foi encontrada.')
    if dados.status == 'ABERTA':
        raise HTTPException(status_code=409, detail={
            'codigo': 'TRANSICAO_STATUS_INVALIDA', 'mensagem': 'A ordem não pode ser reaberta.'})
    payload = exemplo('ordem_atualizada')
    payload.update(status=dados.status, motivo_cancelamento=dados.motivo_cancelamento,
                   resultado=dados.resultado.model_dump(mode='json') if dados.resultado else None)
    return payload
