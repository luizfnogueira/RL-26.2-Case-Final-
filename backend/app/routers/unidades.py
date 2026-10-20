from typing import Annotated

from fastapi import APIRouter, Query

from app.routers.common import STUB, respostas
from app.schemas.common import Pagina
from app.schemas.unidades import FiltroUnidade, FiltrosUnidades, Unidade, Unidade360
from app.services.stubs import exemplo, paginar, verificar_id

router = APIRouter(prefix='/unidades', tags=['Unidades'])


@router.get('', response_model=Pagina[Unidade], summary='Buscar unidades',
            description=STUB + ' Busca, filtros e paginação aplicados ao cadastro de exemplo.',
            responses=respostas('unidades'))
async def listar_unidades(filtros: Annotated[FiltrosUnidades, Query()]):
    return paginar(exemplo('unidades'), filtros)


@router.get('/{id}', response_model=Unidade360, summary='Visão 360 da unidade',
            description=STUB + ' ID disponível: UC-DEMO-001. Retorna a competência fixa 2026-09.',
            responses=respostas('unidade', erros=(404, 422, 500)))
async def detalhar_unidade(id: str, filtros: Annotated[FiltroUnidade, Query()]):
    verificar_id(id, 'UC-DEMO-001', 'UNIDADE_NAO_ENCONTRADA', 'A unidade solicitada não foi encontrada.')
    return exemplo('unidade')
