from typing import Annotated

from fastapi import APIRouter, Query

from app.routers.common import STUB, respostas
from app.schemas.operacao import FiltrosOperacao, Operacao
from app.services.stubs import exemplo, paginar

router = APIRouter(tags=['Operação'])


@router.get('/operacao', response_model=Operacao, summary='DEC/FEC por alimentador',
            description=STUB + ' Filtros/paginação sobre o exemplo; DEC/FEC ainda indisponíveis no P1.',
            responses=respostas('operacao', erros=(422, 500, 503)))
async def operacao(filtros: Annotated[FiltrosOperacao, Query()]):
    payload = paginar(exemplo('operacao'), filtros)
    payload['periodo_referencia'] = filtros.periodo_atual
    return payload
