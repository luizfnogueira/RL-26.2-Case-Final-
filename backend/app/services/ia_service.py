"""Ponte do POST /ia com o agente de IA: escolhe o agente pelo IA_MODO e confere a resposta antes do front."""
import logging
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as PrazoEsgotado
from datetime import datetime, timezone
from typing import Any, Callable, Protocol

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.core import config
from app.core.exceptions import AgenteIndisponivelException
from app.db.session import SessionLocal
from app.repositories import interacao_repository
from app.repositories.gold_metadata import metadados_gold
from app.schemas.ia import GraficoIA, PerguntaIA, RespostaIA
from app.services import esclarecimento_ia, grafico_ia, stub_ia
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


# "O primeiro município que eu perguntei?": com mais de 3 trocas, o agente não vê o começo da conversa
_COMECO = re.compile(r"\b(?:primeir[oa]s?|in[ií]cio|come[cç]o)\b", re.IGNORECASE)
_FALA_DA_PESSOA = re.compile(
    r"\b(?:perguntei|consultei|pedi|falei|citei|mencionei)\b|\bprimeira\s+pergunta\b", re.IGNORECASE)


def pede_o_comeco_da_conversa(pergunta: str) -> bool:
    return bool(_COMECO.search(pergunta) and _FALA_DA_PESSOA.search(pergunta))


def resposta_sem_o_comeco_da_conversa(historico: list[dict], resumo: list[str], gold_atualizada_em: Any) -> dict:
    """Resposta `nao_sei` sem chamar o modelo, que chutaria a troca mais antiga que vê (GENAI-13).

    Só acontece depois de 13 trocas: as 3 da memória mais as 10 do resumo.
    """
    mais_antiga = resumo[0] if resumo else (historico[0]["pergunta_interpretada"] if historico else None)
    lembradas = interacao_repository.MAX_TROCAS + interacao_repository.MAX_RESUMO
    texto = (f"Eu só lembro das últimas {lembradas} perguntas respondidas desta conversa, "
             "e o começo dela já saiu da minha memória.")
    if mais_antiga:
        texto += f" A mais antiga de que lembro é: “{mais_antiga}”."
    texto += " Se quiser consultar de novo, é só repetir o município, a classe ou o período."
    return {
        "resposta": texto, "sql": None, "tabelas": [], "dados": {"colunas": [], "linhas": []},
        "status": "nao_sei", "gerado_em": datetime.now(timezone.utc).isoformat(), "apresentacao": "texto",
        "metadados": {"dados_ficticios": False, "gold_atualizada_em": gold_atualizada_em, "observacoes": []},
    }


def acrescentar_grafico(pergunta: str, resposta: dict) -> None:
    """Gráfico na conversa a partir dos dados da resposta; um erro aqui só tira o gráfico, nunca vira 503."""
    try:
        grafico, nota = grafico_ia.montar_grafico(pergunta, resposta)
        if grafico is not None:
            GraficoIA.model_validate(grafico)
            resposta["grafico"] = grafico
            resposta["apresentacao"] = "grafico"
        elif nota:
            resposta["metadados"].setdefault("observacoes", []).append(nota)
    except (ValidationError, KeyError, TypeError, ValueError) as erro:
        logger.warning("Gráfico da resposta descartado (%s)", type(erro).__name__)
        resposta.pop("grafico", None)


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
                # Conversa longa: as perguntas anteriores às 3 da memória, em lista curta (só para o agente)
                resumo = (interacao_repository.carregar_resumo(db, dados.conversa_id)
                          if len(historico) >= interacao_repository.MAX_TROCAS else [])
                gold = metadados_gold(db, "agg_kpis_mensal", OBSERVACAO_SEED)
                # Pergunta ambígua volta com opções antes de gastar tokens
                esclarecer = esclarecimento_ia.detectar(
                    dados.pergunta, historico, esclarecimento_ia.vocabulario(db, gold["gold_atualizada_em"]))
                sem_o_comeco = not esclarecer and (
                    pede_o_comeco_da_conversa(dados.pergunta)
                    and interacao_repository.contar_trocas(db, dados.conversa_id) > len(historico) + len(resumo))
            if esclarecer:
                resposta = esclarecimento_ia.resposta(esclarecer, gold["gold_atualizada_em"])
            elif sem_o_comeco:
                resposta = resposta_sem_o_comeco_da_conversa(historico, resumo, gold["gold_atualizada_em"])
            else:
                resposta = executar_com_prazo(lambda: responder(
                    dados.pergunta,
                    historico=historico,
                    resumo_conversa=resumo,
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
            acrescentar_grafico(dados.pergunta, resposta)
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
