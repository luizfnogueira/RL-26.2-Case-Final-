from typing import Annotated

from fastapi import APIRouter, Query

from app.routers.common import STUB, respostas
from app.schemas.operacao import FiltrosOperacao, Operacao
from app.services.stub_operacao import montar_operacao

router = APIRouter(tags=['Operação'])


@router.get('/operacao', response_model=Operacao, summary='DEC/FEC por alimentador e região',
            description=STUB + ' Rankings paginados de forma independente; a série não é paginada. '
            'Filtro classe retorna 422.',
            responses=respostas('operacao', erros=('CENARIO_STUB_INDISPONIVEL',)))
async def operacao(filtros: Annotated[FiltrosOperacao, Query()]):
    return montar_operacao(filtros)
