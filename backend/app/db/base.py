"""Bases declarativas separadas por schema do PostgreSQL.

Convenção (B2): a recarga da Gold só cria, apaga ou reescreve tabelas do schema `gold`.
As tabelas do portal (ordens de inspeção e histórico, O1b) ficam no schema `portal`
e nunca são tocadas pela recarga.
"""
from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

GOLD_SCHEMA = "gold"
PORTAL_SCHEMA = "portal"

NOMES = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class GoldBase(DeclarativeBase):
    """Tabelas lidas pela API e recarregadas a partir da Gold."""

    metadata = MetaData(schema=GOLD_SCHEMA, naming_convention=NOMES)


class PortalBase(DeclarativeBase):
    """Tabelas escritas pelo portal. Preservadas em toda recarga da Gold."""

    metadata = MetaData(schema=PORTAL_SCHEMA, naming_convention=NOMES)
