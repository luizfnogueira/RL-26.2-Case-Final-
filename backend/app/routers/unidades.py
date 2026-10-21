from typing import Annotated

from fastapi import APIRouter, Query

from app.core.exceptions import UCInexistenteException
from app.routers.common import STUB, respostas
from app.schemas.unidades import FiltroUnidade, FiltrosUnidades, Unidade360, Unidades
from app.services.stubs import exemplo, filtrar_regiao, paginar, verificar_cenario

router = APIRouter(prefix='/unidades', tags=['Unidades'])

UC_DETALHADA = 'UC-DEMO-001'


@router.get('', response_model=Unidades, summary='Buscar unidades',
            description=STUB + ' Busca por ID ou titular, filtros e paginação sobre o cadastro de exemplo.',
            responses=respostas('unidades'))
async def listar_unidades(filtros: Annotated[FiltrosUnidades, Query()]):
    base = exemplo('unidades')
    unidades = filtrar_regiao(base['items'], filtros)
    if filtros.busca:
        busca = filtros.busca.casefold()
        unidades = [uc for uc in unidades
                    if busca in uc['id_uc'].casefold() or busca in uc['nome_titular'].casefold()]
    unidades.sort(key=lambda uc: uc['id_uc'])
    return {**paginar(unidades, filtros), 'metadados': base['metadados']}


@router.get('/{id}', response_model=Unidade360, summary='Visão 360 da unidade',
            description=STUB + f' Só {UC_DETALHADA} tem visão detalhada; outros IDs retornam 404.',
            responses=respostas('unidade', erros=('UC_INEXISTENTE', 'CENARIO_STUB_INDISPONIVEL')))
async def detalhar_unidade(id: str, filtros: Annotated[FiltroUnidade, Query()]):
    verificar_cenario(filtros.periodo_atual)
    if id != UC_DETALHADA:
        raise UCInexistenteException(f"Unidade Consumidora '{id}' não disponível no cenário.")
    return exemplo('unidade')
