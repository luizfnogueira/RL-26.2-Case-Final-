from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import CORS_ORIGINS

app = FastAPI(title="Backend API", version="0.1.0")

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
