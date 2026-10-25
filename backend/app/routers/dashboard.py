from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.routers.common import respostas
from app.schemas.dashboard import Dashboard, FiltrosDashboard
from app.services.dashboard_service import montar_dashboard

router = APIRouter(tags=['Dashboard'])


# def (não async): a sessão do SQLAlchemy é síncrona, então o FastAPI roda a rota numa thread
@router.get('/dashboard', response_model=Dashboard, summary='KPIs, série, ponte e drill-down da receita',
            description='Indicadores e série histórica de 48 meses calculados no banco. Ponte de receita e '
            'drill-down lidos da decomposição preço × volume da Gold (agg_preco_volume), que só existe para '
            'periodo_atual=2025-07/2026-06 e periodo_comparacao=2022-07/2023-06; outros períodos retornam 422 '
            'CENARIO_STUB_INDISPONIVEL. Com filtro de alimentador, ponte e drill-down vêm vazios. '
            'DEC/FEC só no consolidado ou por município.',
            responses=respostas('dashboard', erros=('CENARIO_STUB_INDISPONIVEL',)))
def dashboard(filtros: Annotated[FiltrosDashboard, Query()], db: Annotated[Session, Depends(get_db)]):
    return montar_dashboard(db, filtros)
