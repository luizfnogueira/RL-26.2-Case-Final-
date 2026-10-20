from typing import Annotated

from fastapi import APIRouter, Query

from app.routers.common import STUB, respostas
from app.schemas.common import FiltrosDashboard
from app.schemas.dashboard import Dashboard
from app.services.stubs import exemplo

router = APIRouter(tags=['Dashboard'])


@router.get('/dashboard', response_model=Dashboard, summary='Indicadores e comparação de receita',
            description=STUB + ' Retorna o recorte fixo do P1; filtros não recalculam indicadores.',
            responses=respostas('dashboard', erros=(422, 500, 503)))
async def dashboard(filtros: Annotated[FiltrosDashboard, Query()]):
    return exemplo('dashboard')
