from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import DATABASE_URL

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
