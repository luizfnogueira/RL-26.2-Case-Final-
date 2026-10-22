from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, Text, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import PortalBase

STATUS_VALIDOS_SQL = "('ABERTA', 'EM_CAMPO', 'CONCLUIDA', 'CANCELADA')"
NOME_INDICE_ORDEM_ATIVA = "uq_ordens_inspecao_uc_ativa"


class OrdemInspecao(PortalBase):
    __tablename__ = "ordens_inspecao"
    __table_args__ = (
        CheckConstraint(f"status IN {STATUS_VALIDOS_SQL}", name="status_valido"),
        Index("ix_ordens_inspecao_id_uc", "id_uc"),
        Index(
            NOME_INDICE_ORDEM_ATIVA,
            "id_uc",
            unique=True,
            postgresql_where=text("status IN ('ABERTA', 'EM_CAMPO')"),
        ),
    )

    id_ordem: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_uc: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    equipe_responsavel: Mapped[str] = mapped_column(String(200), nullable=False)
    data_criacao: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    data_prevista: Mapped[date | None] = mapped_column(Date)
    data_inicio_campo: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_conclusao: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_cancelamento: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    justificativa_cancelamento: Mapped[str | None] = mapped_column(Text)
    motivo: Mapped[str | None] = mapped_column(Text)
    kwh_estimado: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    observacoes: Mapped[str | None] = mapped_column(Text)
    resultado: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    historico: Mapped[list["OrdemHistorico"]] = relationship(
        back_populates="ordem",
        cascade="all, delete-orphan",
        order_by="OrdemHistorico.id_historico",
        lazy="selectin",
    )


class OrdemHistorico(PortalBase):
    __tablename__ = "ordens_historico"
    __table_args__ = (
        CheckConstraint(
            f"status_novo IN {STATUS_VALIDOS_SQL}",
            name="status_novo_valido",
        ),
        CheckConstraint(
            f"status_anterior IS NULL OR status_anterior IN {STATUS_VALIDOS_SQL}",
            name="status_anterior_valido",
        ),
    )

    id_historico: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_ordem: Mapped[int] = mapped_column(
        ForeignKey("ordens_inspecao.id_ordem", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status_anterior: Mapped[str | None] = mapped_column(String(20))
    status_novo: Mapped[str] = mapped_column(String(20), nullable=False)
    data_mudanca: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usuario: Mapped[str | None] = mapped_column(String(100))
    justificativa_ou_motivo: Mapped[str | None] = mapped_column(Text)
    detalhes: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    ordem: Mapped[OrdemInspecao] = relationship(back_populates="historico")
