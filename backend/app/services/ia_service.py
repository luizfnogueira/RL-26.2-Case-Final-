"""Ponte do POST /ia com o agente de IA: escolhe o agente pelo IA_MODO e confere a resposta antes do front."""
import logging
import uuid
from typing import Protocol

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.core import config
from app.core.exceptions import AgenteIndisponivelException
from app.db.session import SessionLocal
from app.repositories import interacao_repository
from app.schemas.ia import PerguntaIA, RespostaIA
from app.services import stub_ia

logger = logging.getLogger(__name__)


class Agente(Protocol):
    """Qualquer agente recebe a pergunta e devolve a resposta no formato do contrato (RespostaIA)."""

    def perguntar(self, dados: PerguntaIA) -> dict: ...


class AgenteMock:
    """IA_MODO=mock: os cenários do contrato (ok, nao_sei, bloqueado), sem chamar o agente."""

    def perguntar(self, dados: PerguntaIA) -> dict:
        return stub_ia.responder(dados)


def obter_agente() -> Agente:
    """Agente do IA_MODO do .env; dependência da rota, trocada por um agente falso nos testes."""
    if config.IA_MODO == "mock":
        return AgenteMock()
    # O AgenteReal (chamada HTTP ao agente da Equipe 3) entra no passo 4
    raise AgenteIndisponivelException()


def perguntar(dados: PerguntaIA, agente: Agente) -> dict:
    """Chama o agente e só devolve ao front uma resposta que siga o contrato."""
    # Quem cria o id da conversa é o backend; o front só guarda e reenvia (GENAI-12.1)
    if dados.conversa_id is None:
        dados = dados.model_copy(update={"conversa_id": uuid.uuid4()})
    resposta = agente.perguntar(dados)
    if isinstance(resposta, dict):
        resposta = {**resposta, "conversa_id": str(dados.conversa_id)}
    try:
        # Modelo local pode devolver JSON incompleto ou fora do formato: vira 503, nunca 500 na tela 7
        RespostaIA.model_validate(resposta)
    except ValidationError as erro:
        raise AgenteIndisponivelException() from erro
    return resposta


def apagar_conversas_antigas() -> None:
    """Retenção de 30 dias da ia.interacao, quando a API sobe em IA_MODO=real (GENAI-11.4).

    Banco fora do ar não impede a API de subir: a limpeza fica para o próximo início.
    """
    if config.IA_MODO != "real":
        return
    try:
        with SessionLocal() as db:
            apagadas = interacao_repository.apagar_antigas(db)
        logger.info("ia.interacao: %d trocas com mais de 30 dias apagadas", apagadas)
    except SQLAlchemyError:
        logger.warning("Não foi possível limpar ia.interacao", exc_info=True)
