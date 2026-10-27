from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from functools import lru_cache

from sqlalchemy.engine import Engine, make_url

from app.core.config import AGENTE_DB_PASSWORD, AGENTE_DB_USER, DATABASE_URL, DATABASE_URL_AGENTE

@lru_cache(maxsize=1)
def obter_engine_agente() -> Engine:
    """Conexão do usuário somente leitura do assistente (GENAI-5). Criada só no primeiro uso."""
    if DATABASE_URL_AGENTE:
        url = DATABASE_URL_AGENTE
    elif AGENTE_DB_PASSWORD:
        url = make_url(DATABASE_URL).set(username=AGENTE_DB_USER, password=AGENTE_DB_PASSWORD)
    else:
        raise RuntimeError("Defina AGENTE_DB_PASSWORD no backend/.env.")
    return create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=2)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

def get_db() -> Iterator[Session]:
    """Dependência do FastAPI: uma sessão por requisição, fechada ao final.

    Uso: `def rota(db: Annotated[Session, Depends(get_db)])`. Quem escreve faz o
    commit no service/repository; exceções não commitadas são descartadas no close.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
