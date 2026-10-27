from typing import Annotated

from fastapi import APIRouter, Body, Depends, Path, Query
from sqlalchemy.orm import Session

from app.core.exceptions import (
    JustificativaObrigatoriaException, ResultadoIncompletoException, TransicaoInvalidaException,
)
from app.db.session import get_db
from app.repositories.candidato_repository import SqlAlchemyCandidatoRepository
from app.repositories.inspecao_repository import SqlAlchemyOrdemInspecaoRepository
from app.routers.common import respostas
from app.schemas.inspecao import (
    OrdemInspecaoAvancarCampo,
    OrdemInspecaoCreate,
    OrdemInspecaoResponse,
    ResultadoInspecao,
    StatusOrdem,
)
from app.schemas.inspecoes import (
    AtualizarInspecao, Candidatos, CriarInspecao, FiltrosCandidatos, FiltrosInspecoes, Ordem, Ordens,
)
from app.services.candidato_service import CandidatoService
from app.services.inspecao_service import OrdemInspecaoService
from app.services.stubs import exemplo

router = APIRouter(prefix='/inspecoes', tags=['Inspeções'])

PERSISTENCIA = (' Ordens e histórico são persistidos no schema portal; a recarga da Gold não os apaga. '
                'Há no máximo uma ordem ativa (ABERTA/EM_CAMPO) por UC, garantida por índice único parcial.')


def get_service(db: Annotated[Session, Depends(get_db)]) -> OrdemInspecaoService:
    return OrdemInspecaoService(repository=SqlAlchemyOrdemInspecaoRepository(db))


def get_candidatos_service(db: Annotated[Session, Depends(get_db)]) -> CandidatoService:
    return CandidatoService(repository=SqlAlchemyCandidatoRepository(db))


def para_transporte(ordem: OrdemInspecaoResponse) -> dict:
    return ordem.model_dump(mode='json')


def metadados() -> dict:
    return {
        'dados_ficticios': True,
        'gold_atualizada_em': None,
        'observacoes': [
            'Dados fictícios do seed; as ordens de inspeção são persistidas no schema portal.'
        ],
    }


@router.get('/candidatos', response_model=Candidatos, summary='Fila priorizada de candidatos',
            description=(
                'Fila lida da Gold/seed, sem stub. Filtros geográficos por AND; ordenação por score '
                'decrescente, kWh estimado decrescente e ID crescente. A posição é global após os '
                'filtros e antes da paginação. O resumo também ignora a paginação. O indicador de '
                'ordem ativa é lido do schema portal. Com GOLD_SOURCE=real, somente UCs com '
                'status_triagem=ELEGIVEL e acao_recomendada=INSPECAO_PRIORITARIA entram na fila. '
                'Casos de VALIDACAO_DOCUMENTAL permanecem na Gold, fora desta fila de campo.'
            ),
            responses=respostas('candidatos', erros=('CENARIO_STUB_INDISPONIVEL',)))
async def candidatos(
    filtros: Annotated[FiltrosCandidatos, Query()],
    servico: Annotated[CandidatoService, Depends(get_candidatos_service)],
):
    return servico.listar(filtros)


@router.get('', response_model=Ordens, summary='Listar ordens de inspeção',
            description=PERSISTENCIA + ' contagem_status ignora o filtro status e a paginação.',
            responses=respostas('inspecoes'))
async def listar_inspecoes(
    filtros: Annotated[FiltrosInspecoes, Query()],
    servico: Annotated[OrdemInspecaoService, Depends(get_service)],
):
    ordens, total, contagem = servico.consultar_ordens(
        status=StatusOrdem(filtros.status) if filtros.status is not None else None,
        id_uc=filtros.id_uc,
        periodo_atual=filtros.periodo_atual,
        municipio=filtros.municipio,
        bairro=filtros.bairro,
        classe=filtros.classe,
        alimentador=filtros.alimentador,
        page=filtros.page,
        page_size=filtros.page_size,
    )
    return {
        'items': [para_transporte(ordem) for ordem in ordens],
        'page': filtros.page,
        'page_size': filtros.page_size,
        'total': total,
        'contagem_status': contagem,
        'metadados': metadados(),
    }


@router.post('', response_model=Ordem, status_code=201, summary='Criar ordem de inspeção',
             description=PERSISTENCIA + ' UC inexistente retorna 404; UC já com ordem ativa retorna 409. '
             'Com GOLD_SOURCE=real, UC marcada como VALIDACAO_DOCUMENTAL em gold.tb_fila_perdas '
             'retorna 422 DADOS_INVALIDOS, sem criar ordem nem histórico.',
             responses=respostas('ordem_criada', status=201, erros=('UC_INEXISTENTE', 'ORDEM_ATIVA_EXISTENTE')))
async def criar_inspecao(
    dados: Annotated[CriarInspecao, Body(openapi_examples={
        'criar': {'value': exemplo('criar_inspecao')},
    })],
    servico: Annotated[OrdemInspecaoService, Depends(get_service)],
):
    ordem = servico.criar_ordem(OrdemInspecaoCreate(**dados.model_dump()))
    return para_transporte(ordem)


@router.patch('/{id}', response_model=Ordem, summary='Avançar, concluir ou cancelar ordem',
              description=PERSISTENCIA + ' Concluir exige ordem EM_CAMPO e resultado válido.',
              responses=respostas('ordem_atualizada', erros=(
                  'TRANSICAO_INVALIDA', 'JUSTIFICATIVA_OBRIGATORIA', 'RESULTADO_INCOMPLETO',
                  'ORDEM_NAO_ENCONTRADA')))
async def atualizar_inspecao(
    id: Annotated[int, Path(gt=0)],
    dados: Annotated[AtualizarInspecao, Body(openapi_examples={
        'iniciar': {'value': exemplo('iniciar_inspecao')},
        'concluir': {'value': exemplo('concluir_inspecao')},
        'cancelar': {'value': exemplo('cancelar_inspecao')},
    })],
    servico: Annotated[OrdemInspecaoService, Depends(get_service)],
):
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
