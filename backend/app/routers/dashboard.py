from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.routers.common import respostas
from app.schemas.dashboard import Comparacao, Dashboard, FiltrosComparacao, FiltrosDashboard
from app.services.comparacao_service import montar_comparacao
from app.services.dashboard_service import montar_dashboard

router = APIRouter(tags=['Dashboard'])


# def (não async): a sessão do SQLAlchemy é síncrona, então o FastAPI roda a rota numa thread
@router.get('/dashboard', response_model=Dashboard, summary='KPIs, série, ponte e drill-down da receita',
            description='Indicadores e série histórica de 48 meses calculados no banco. Ponte de receita e '
            'drill-down lidos da decomposição preço × volume da Gold (agg_preco_volume), que existe para '
            'periodo_atual=2025-07/2026-06 × periodo_comparacao=2022-07/2023-06, por município, bairro e classe; '
            'fora disso (outros períodos ou filtro de alimentador) vêm com valores null e lista vazia, e os KPIs '
            'e a série seguem calculados. DEC/FEC só no consolidado ou por município.',
            responses=respostas('dashboard'))
def dashboard(filtros: Annotated[FiltrosDashboard, Query()], db: Annotated[Session, Depends(get_db)]):
    return montar_dashboard(db, filtros)


@router.get('/dashboard/comparacao', response_model=Comparacao, summary='Comparação de 2 a 4 recortes',
            description='Os KPIs do /dashboard para cada item (itens repetido de 2 a 4 vezes, com os valores do '
            'GET /filtros), lado a lado, com receita e consumo por UC por mês e valor em aberto em % da receita. '
            'nivel=bairro exige municipio; nivel=classe aceita municipio e bairro. Item sem UCs no recorte vem '
            'com os indicadores ausentes, sem derrubar os outros. DEC/FEC só por município.',
            responses=respostas('comparacao'))
def comparacao(filtros: Annotated[FiltrosComparacao, Query()], db: Annotated[Session, Depends(get_db)]):
    return montar_comparacao(db, filtros)
