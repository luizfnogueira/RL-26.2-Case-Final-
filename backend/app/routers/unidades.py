from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.unidade_repository import SqlAlchemyUnidadeRepository
from app.routers.common import respostas
from app.schemas.unidades import FiltroUnidade, FiltrosUnidades, Unidade360, Unidades
from app.services.unidade_service import UnidadeService

router = APIRouter(prefix='/unidades', tags=['Unidades'])

FONTE = (' Com GOLD_SOURCE=real lê a Gold importada (dim_uc, fato_uc_mes, uc_consumo_comparativo, '
         'uc_interrupcoes, uc_atendimentos); com seed devolve o exemplo fictício do contrato.')


def get_service(db: Annotated[Session, Depends(get_db)]) -> UnidadeService:
    return UnidadeService(SqlAlchemyUnidadeRepository(db))


# def (não async): a sessão do banco bloqueia, então o FastAPI roda a rota numa thread
@router.get('', response_model=Unidades, summary='Buscar unidades',
            description='Busca por ID ou titular (3 a 100 caracteres, sem diferenciar maiúsculas), '
                        'filtros de região por AND e paginação; ordenação por ID.' + FONTE,
            responses=respostas('unidades'))
def listar_unidades(filtros: Annotated[FiltrosUnidades, Query()],
                    service: Annotated[UnidadeService, Depends(get_service)]):
    return service.buscar(filtros)


@router.get('/{id}', response_model=Unidade360, summary='Visão 360 da unidade',
            description='Cadastro, 12 meses de consumo com o ano anterior, diagnóstico "a conta veio alta?", '
                        'faturas, medidor, GD, interrupções e chamados. periodo_atual tem 12 meses; sem ele, '
                        'a janela termina no último mês da Gold. UC inexistente: 404.' + FONTE,
            responses=respostas('unidade', erros=('UC_INEXISTENTE', 'CENARIO_STUB_INDISPONIVEL')))
def detalhar_unidade(id: str, filtros: Annotated[FiltroUnidade, Query()],
                     service: Annotated[UnidadeService, Depends(get_service)]):
    return service.detalhar(id, filtros)
