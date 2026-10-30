"""Inicializacao explicita de uma instalacao nova; nao faz parte da recarga Gold."""
from sqlalchemy import text
from app.db.base import PortalBase
from app.db.session import engine
from app.models import portal  # noqa: F401
from app.models import usuario  # noqa: F401


def main():
    with engine.begin() as conn:
        conn.execute(text('CREATE SCHEMA IF NOT EXISTS portal'))
        PortalBase.metadata.create_all(conn)


if __name__ == '__main__':
    main()
