"""Ponte do POST /ia com o agente de IA: escolhe o agente pelo IA_MODO e confere a resposta antes do front."""
from typing import Protocol

from pydantic import ValidationError

from app.core import config
from app.core.exceptions import AgenteIndisponivelException
from app.schemas.ia import PerguntaIA, RespostaIA
from app.services import stub_ia


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
    resposta = agente.perguntar(dados)
    try:
        # Modelo local pode devolver JSON incompleto ou fora do formato: vira 503, nunca 500 na tela 7
        RespostaIA.model_validate(resposta)
    except ValidationError as erro:
        raise AgenteIndisponivelException() from erro
    return resposta
