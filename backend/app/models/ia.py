"""ia.interacao: memória da conversa e log de auditoria do assistente (GENAI-11, 20).

Uma linha por resposta do POST /ia em IA_MODO=real, inclusive bloqueado e nao_sei.
"""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ARRAY, BigInteger, CheckConstraint, DateTime, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import IABase


class Interacao(IABase):
    __tablename__ = "interacao"
    __table_args__ = (
        CheckConstraint("status IN ('ok', 'nao_sei', 'bloqueado')", name="status_valido"),
        # Carregar as últimas trocas de uma conversa (memória) é a consulta mais frequente.
        Index("ix_interacao_conversa_id_criado_em", "conversa_id", text("criado_em DESC")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversa_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Preenchido quando houver login no portal; hoje a API não tem autenticação.
    usuario_id: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
                                                server_default=func.now())
    # Pergunta e respostas são gravadas com CPF/CNPJ e e-mails mascarados.
    pergunta: Mapped[str] = mapped_column(Text, nullable=False)
    pergunta_interpretada: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    motivo: Mapped[str | None] = mapped_column(Text)
    resposta_resumo: Mapped[str | None] = mapped_column(Text)
    filtros: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    sql_executado: Mapped[str | None] = mapped_column(Text)
    tabelas: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    linhas: Mapped[int | None] = mapped_column(Integer)
    skills: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    latencia_ms: Mapped[int | None] = mapped_column(Integer)
    tokens_entrada: Mapped[int | None] = mapped_column(Integer)
    tokens_saida: Mapped[int | None] = mapped_column(Integer)
    chamadas: Mapped[int | None] = mapped_column(Integer)
    modelo: Mapped[str | None] = mapped_column(Text)
