from typing import Annotated

from fastapi import APIRouter, Body, Path, Query

from app.core.exceptions import (
    JustificativaObrigatoriaException, ResultadoIncompletoException, TransicaoInvalidaException,
)
from app.routers.common import STUB, respostas
from app.schemas.inspecao import OrdemInspecaoAvancarCampo, OrdemInspecaoCreate, ResultadoInspecao
from app.schemas.inspecoes import (
    AtualizarInspecao, Candidatos, CriarInspecao, FiltrosCandidatos, FiltrosInspecoes, Ordem, Ordens,
)
from app.services.stub_inspecoes import listar_candidatos, listar_ordens, para_transporte, servico_ordens
from app.services.stubs import exemplo

router = APIRouter(prefix='/inspecoes', tags=['Inspeções'])

SNAPSHOT = (' Snapshot: 1 ABERTA/UC-DEMO-002, 2 EM_CAMPO/UC-DEMO-005, 3 CONCLUIDA, 4 CANCELADA. '
            'Regras do service do Gabriel; nada persiste entre chamadas.')


@router.get('/candidatos', response_model=Candidatos, summary='Fila priorizada de candidatos',
            description=STUB + ' Ordenada por score decrescente e ID; resumo calculado antes da paginação.',
            responses=respostas('candidatos', erros=('CENARIO_STUB_INDISPONIVEL',)))
async def candidatos(filtros: Annotated[FiltrosCandidatos, Query()]):
    return listar_candidatos(filtros)


@router.get('', response_model=Ordens, summary='Listar ordens de inspeção',
            description=STUB + SNAPSHOT + ' contagem_status ignora o filtro status e a paginação.',
            responses=respostas('inspecoes'))
async def listar_inspecoes(filtros: Annotated[FiltrosInspecoes, Query()]):
    return listar_ordens(filtros)


@router.post('', response_model=Ordem, status_code=201, summary='Criar ordem de inspeção',
             description=STUB + SNAPSHOT + ' Criar UC-DEMO-001 funciona; UC-DEMO-002/005 retornam 409.',
             responses=respostas('ordem_criada', status=201, erros=('UC_INEXISTENTE', 'ORDEM_ATIVA_EXISTENTE')))
async def criar_inspecao(dados: Annotated[CriarInspecao, Body(openapi_examples={
    'criar': {'value': exemplo('criar_inspecao')},
})]):
    ordem = servico_ordens().criar_ordem(OrdemInspecaoCreate(**dados.model_dump()))
    return para_transporte(ordem)


@router.patch('/{id}', response_model=Ordem, summary='Avançar, concluir ou cancelar ordem',
              description=STUB + SNAPSHOT + ' Concluir exige ordem EM_CAMPO (use a 2).',
              responses=respostas('ordem_atualizada', erros=(
                  'TRANSICAO_INVALIDA', 'JUSTIFICATIVA_OBRIGATORIA', 'RESULTADO_INCOMPLETO',
                  'ORDEM_NAO_ENCONTRADA')))
async def atualizar_inspecao(id: Annotated[int, Path(gt=0)], dados: Annotated[AtualizarInspecao, Body(openapi_examples={
    'iniciar': {'value': exemplo('iniciar_inspecao')},
    'concluir': {'value': exemplo('concluir_inspecao')},
    'cancelar': {'value': exemplo('cancelar_inspecao')},
})]):
    servico = servico_ordens()
    if dados.status == 'EM_CAMPO':
        ordem = servico.avancar_para_campo(id, OrdemInspecaoAvancarCampo(
            equipe_responsavel=dados.equipe_responsavel, observacoes=dados.observacoes))
    elif dados.status == 'CANCELADA':
        if not dados.justificativa:
            servico.obter_ordem(id)
            raise JustificativaObrigatoriaException('Informe a justificativa para cancelar a ordem.')
        ordem = servico.cancelar_ordem(id, dados.justificativa)
    elif dados.status == 'CONCLUIDA':
        if dados.resultado is None:
            servico.obter_ordem(id)
            raise ResultadoIncompletoException('Informe o resultado da inspeção para concluir a ordem.')
        ordem = servico.concluir_ordem(id, ResultadoInspecao(**dados.resultado.model_dump()))
    else:
        servico.obter_ordem(id)
        raise TransicaoInvalidaException('Uma ordem não pode voltar para ABERTA.')
    return para_transporte(ordem)
