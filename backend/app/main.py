from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import CORS_ORIGINS
from app.core.errors import register_error_handlers
from app.core.exceptions import AppException

from app.routers import dashboard, filtros, ia, inspecoes, operacao, unidades

app = FastAPI(
    title="V-Energy Grid 360 API",
    version="0.2.0",
    description=(
        "API do case V-Energy — contrato V2 (docs/api-contract.md). As ordens de inspeção "
        "(GET/POST/PATCH /inspecoes) persistem no schema portal; a fila de candidatos lê a Gold/seed "
        "e as ordens ativas do portal. Dashboard, filtros, unidades (Visão 360), operação e números "
        "do insight de receita usam a fonte selecionada por GOLD_SOURCE."
    ),
)
register_error_handlers(app)

for router in (dashboard.router, filtros.router, unidades.router, inspecoes.router, operacao.router,
               ia.router):
    app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict(),
    )


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "API funcionando!"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
