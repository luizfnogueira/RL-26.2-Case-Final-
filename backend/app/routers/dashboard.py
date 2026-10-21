from typing import Annotated

from fastapi import APIRouter, Query

from app.routers.common import STUB, respostas
from app.schemas.dashboard import Dashboard, FiltrosDashboard
from app.services.stub_dashboard import montar_dashboard

router = APIRouter(tags=['Dashboard'])


@router.get('/dashboard', response_model=Dashboard, summary='KPIs, série, ponte e drill-down da receita',
            description=STUB + ' Recortes por município, bairro, classe e alimentador são distribuição '
            'ilustrativa do consolidado; DEC/FEC só no consolidado.',
            responses=respostas('dashboard', erros=('CENARIO_STUB_INDISPONIVEL',)))
async def dashboard(filtros: Annotated[FiltrosDashboard, Query()]):
    return montar_dashboard(filtros)
