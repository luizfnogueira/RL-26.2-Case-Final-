from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.routers.common import respostas
from app.schemas.filtros import OpcoesFiltros
from app.services.filtros_service import montar_filtros

router = APIRouter(tags=['Filtros'])


# def (não async): a sessão do SQLAlchemy é síncrona, então o FastAPI roda a rota numa thread
@router.get('/filtros', response_model=OpcoesFiltros, summary='Opções dos filtros de região',
            description='Municípios, bairros (com o município), classes e alimentadores (com o município) '
            'do cadastro de UCs, em ordem alfabética e exatamente como estão na Gold (ex.: RECIFE, BOA VISTA). '
            'É o valor a enviar nos parâmetros municipio, bairro, classe e alimentador das outras rotas.',
            responses=respostas('filtros'))
def filtros(db: Annotated[Session, Depends(get_db)]):
    return montar_filtros(db)
