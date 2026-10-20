from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import CORS_ORIGINS
from app.core.errors import register_error_handlers
from app.routers import dashboard, ia, inspecoes, operacao, unidades

app = FastAPI(
    title="Backend API",
    version="0.1.0",
    description="API de teste do front. Rotas funcionais usam exemplos fictícios do P1, sem banco ou IA. POST/PATCH não persistem alterações.",
)
register_error_handlers(app)

for router in (dashboard.router, unidades.router, inspecoes.router, operacao.router, ia.router):
    app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "API funcionando!"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
