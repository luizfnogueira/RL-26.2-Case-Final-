"""Ponte do POST /ia com o agente de IA: escolhe o agente pelo IA_MODO e confere a resposta antes do front."""
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as PrazoEsgotado
from typing import Any, Callable, Protocol

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.core import config
from app.core.exceptions import AgenteIndisponivelException
from app.db.session import SessionLocal
from app.repositories import interacao_repository
from app.repositories.gold_metadata import metadados_gold
from app.schemas.ia import PerguntaIA, RespostaIA
from app.services import stub_ia
from app.ai.consulta import descrever_tabela, valores_distintos

logger = logging.getLogger(__name__)

OBSERVACAO_SEED = "Dados fictícios do seed, com as regras da Gold."
# A rota desiste no prazo; a thread termina sozinha quando o provedor responde ou estoura o LLM_TIMEOUT_S.
_THREADS_IA = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ia")


class Agente(Protocol):
    """Qualquer agente recebe a pergunta e devolve a resposta no formato do contrato (RespostaIA)."""

    def perguntar(self, dados: PerguntaIA) -> dict: ...


class AgenteMock:
    """IA_MODO=mock: os cenários do contrato (ok, nao_sei, bloqueado), sem chamar o agente."""

    def perguntar(self, dados: PerguntaIA) -> dict:
        return stub_ia.responder(dados)


def prazo_ia_s() -> float:
    """Orçamento do agente: 5 s abaixo do IA_TIMEOUT_S, para sobrar tempo de gravar e responder (GENAI-2.3)."""
    return max(config.IA_TIMEOUT_S - 5, 1)


def executar_com_prazo(funcao: Callable[[], Any], prazo_s: float) -> Any:
    """Roda `funcao` numa thread; passou do prazo, vira AGENTE_INDISPONIVEL."""
    try:
        return _THREADS_IA.submit(funcao).result(timeout=prazo_s)
    except PrazoEsgotado as erro:
        raise AgenteIndisponivelException() from erro


def _responder_do_agente() -> Callable[..., dict]:
    from app.ai.agent import responder  # o PydanticAI só é importado no modo real
    return responder


def _executor_sql() -> Callable:
    """Ferramenta segura de consulta do Vinicius (GENAI-6: validador A2 + usuário somente leitura A1)."""
    try:
        from app.ai.consulta import executar_consulta
    except ImportError:
        logger.error("IA_MODO=real sem a ferramenta de consulta: falta app/ai/consulta.py (GENAI-6)")
        raise
    from app.ai.contratos import ResultadoConsulta

    def executar(sql: str) -> ResultadoConsulta:
        resultado = executar_consulta(sql)
        if isinstance(resultado, ResultadoConsulta):
            return resultado
        # O planning define o retorno como {colunas, linhas, n_linhas, truncado}; o agente lê ResultadoConsulta.
        return ResultadoConsulta.model_validate({"sql_executado": sql, **resultado})
    return executar


class AgenteReal:
    """IA_MODO=real: o agente do Théo (`app.ai.agent.responder`) roda dentro do backend, sem HTTP (GENAI-2).

    Carrega a memória da conversa, responde dentro do prazo e grava a troca em ia.interacao.
    Qualquer falha (provedor fora do ar, UsageLimitExceeded, chave ausente, ferramenta de consulta
    ainda não entregue) vira AGENTE_INDISPONIVEL, que a rota devolve como 503.
    """

    def __init__(self, responder: Callable[..., dict] | None = None, executar_sql: Callable | None = None,
                 sessao: Callable = SessionLocal, prazo_s: float | None = None) -> None:
        self.responder = responder
        self.executar_sql = executar_sql
        self.sessao = sessao
        self.prazo_s = prazo_s

    def perguntar(self, dados: PerguntaIA) -> dict:
        try:
            responder = self.responder or _responder_do_agente()
            executar_sql = self.executar_sql or _executor_sql()
            
            extras = {}
            if self.executar_sql is None:
                from app.ai.consulta import descrever_tabela, valores_distintos
                extras = {"valores_distintos_fn": valores_distintos, "descrever_tabela_fn": descrever_tabela}
            
            with self.sessao() as db:
                historico = interacao_repository.carregar_historico(db, dados.conversa_id)
                gold = metadados_gold(db, "agg_kpis_mensal", OBSERVACAO_SEED)
            resposta = executar_com_prazo(lambda: responder(
                dados.pergunta,
                historico=historico,
                conversa_id=str(dados.conversa_id) if dados.conversa_id is not None else None,
                executar_sql_fn=executar_sql,
                **extras,
                gold_atualizada_em=gold["gold_atualizada_em"],
                # Com o executor injetado o agente desliga o cache; aqui vale a chave dele (GENAI-24).
                usar_cache=os.getenv("AI_CACHE_ENABLED", "1").strip() != "0",
            ), self.prazo_s or prazo_ia_s())
            # O agente não sabe se a Gold é o seed: a proveniência vem da carga, como no resto da API.
            metadados = resposta["metadados"]
            metadados["dados_ficticios"] = gold["dados_ficticios"]
            if gold["dados_ficticios"]:
                metadados["observacoes"] = [*gold["observacoes"], *metadados.get("observacoes", [])]
            RespostaIA.model_validate(resposta)
        except AgenteIndisponivelException:
            raise
        except Exception as erro:
            # Só o tipo vai para o log: mensagens de erro do provedor podem trazer URL ou cabeçalhos
            logger.warning("Agente de IA indisponível (%s)", type(erro).__name__)
            raise AgenteIndisponivelException() from erro
        self._gravar(dados, resposta)
        return resposta

    def _gravar(self, dados: PerguntaIA, resposta: dict) -> None:
        """O log não derruba a resposta: sem a tabela ou com o banco instável, só avisa."""
        try:
            with self.sessao() as db:
                interacao_repository.registrar(db, dados.conversa_id, dados.pergunta, resposta)
        except SQLAlchemyError:
            logger.warning("Não foi possível gravar a troca em ia.interacao", exc_info=True)


def obter_agente() -> Agente:
    """Agente do IA_MODO do .env; dependência da rota, trocada por um agente falso nos testes."""
    if config.IA_MODO == "mock":
        return AgenteMock()
    return AgenteReal()


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
