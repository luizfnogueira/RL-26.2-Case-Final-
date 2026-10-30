from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import get_db

from app.routers.common import respostas
from app.schemas.operacao import FiltrosOperacao, Operacao
from app.services.operacao_service import montar_operacao

router = APIRouter(tags=['Operação'])


@router.get('/operacao', response_model=Operacao, summary='DEC/FEC por alimentador e região',
            description='Consulta a Gold/seed no PostgreSQL. Rankings paginados; a série não é paginada. '
            'Filtro classe retorna 422.',
            responses=respostas('operacao'))
def operacao(filtros: Annotated[FiltrosOperacao, Query()], db: Annotated[Session, Depends(get_db)]):
    return montar_operacao(db, filtros)
