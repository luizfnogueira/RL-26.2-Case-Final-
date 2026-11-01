"""Memória da conversa e log de auditoria do assistente na tabela ia.interacao (GENAI-11, 12, 20).

Sempre pela conexão da API (SessionLocal), nunca pela do agente: o usuário somente leitura
do agente não enxerga o schema ia.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.ia import Interacao

JANELA_CONVERSA = timedelta(hours=2)    # conversa sem pergunta há mais de 2 h recomeça do zero
MAX_TROCAS = 3                          # trocas que viram message_history do agente (~600 tokens)
MAX_RESUMO = 10                         # perguntas anteriores no resumo (~20 a 40 tokens cada)
RESUMO_PERGUNTA_MAX = 150
RETENCAO = timedelta(days=30)
RESUMO_MAX = 300

# CNPJ antes do CPF: os 11 primeiros dígitos de um CNPJ sem pontuação não podem virar "[CPF]".
_CNPJ = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")
_CPF = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def mascarar(texto: str | None) -> str | None:
    """Troca CPF, CNPJ e e-mail digitados por marcadores antes de gravar (GENAI-11.3)."""
    if not texto:
        return texto
    texto = _EMAIL.sub("[e-mail]", texto)
    texto = _CNPJ.sub("[CNPJ]", texto)
    return _CPF.sub("[CPF]", texto)


def registrar(db: Session, conversa_id: uuid.UUID, pergunta: str, resposta: dict) -> None:
    """Grava uma troca a partir da RespostaIA já montada, inclusive bloqueado e nao_sei (GENAI-20.1)."""
    detalhes = resposta.get("detalhes_tecnicos") or {}
    pensamento = detalhes.get("estrutura_pensamento") or {}
    plano = pensamento.get("plano") or {}
    consulta = detalhes.get("consulta") or {}
    tokens = detalhes.get("tokens_tempo") or {}
    texto = mascarar(resposta.get("resposta") or "")
    # Num bloqueio o agente não devolve SQL; o log guarda o que ele tentou executar.
    tentado = next(((a.get("argumentos") or {}).get("sql") for a in reversed(detalhes.get("acoes") or [])
                    if a.get("ferramenta") == "consultar_gold"), None)
    db.add(Interacao(
        conversa_id=conversa_id,
        pergunta=mascarar(pergunta),
        pergunta_interpretada=mascarar(pensamento.get("pergunta_interpretada")),
        status=resposta["status"],
        motivo=None if resposta["status"] == "ok" else texto[:RESUMO_MAX],
        resposta_resumo=texto[:RESUMO_MAX],
        filtros={"filtros": plano.get("filtros", []), "periodo": plano.get("periodo")} if plano else None,
        sql_executado=consulta.get("sql_executado") or resposta.get("sql") or tentado,
        tabelas=resposta.get("tabelas") or [],
        linhas=consulta.get("linhas", len(resposta["dados"]["linhas"])),
        skills=pensamento.get("skills") or [],
        latencia_ms=tokens.get("latencia_total_ms"),
        tokens_entrada=tokens.get("tokens_entrada"),
        tokens_saida=tokens.get("tokens_saida"),
        chamadas=tokens.get("chamadas"),
        modelo=tokens.get("modelo"),
    ))
    db.commit()


def carregar_historico(db: Session, conversa_id: uuid.UUID) -> list[dict]:
    """Até 3 trocas `ok` das últimas 2 h, da mais antiga para a mais recente (GENAI-12.3, 13).

    Id desconhecido ou expirado devolve lista vazia: o agente responde como numa conversa nova.
    Trocas bloqueadas ficam fora para um ataque não voltar ao modelo pelo histórico.
    """
    desde = datetime.now(timezone.utc) - JANELA_CONVERSA
    trocas = db.scalars(
        select(Interacao)
        .where(Interacao.conversa_id == conversa_id, Interacao.status == "ok", Interacao.criado_em >= desde)
        .order_by(Interacao.criado_em.desc(), Interacao.id.desc())
        .limit(MAX_TROCAS)
    ).all()
    # Formato de TrocaHistorico (app.ai.contratos): nunca as linhas de dados, só o resumo e o SQL.
    return [{
        "pergunta_interpretada": t.pergunta_interpretada or t.pergunta,
        "resposta_resumo": t.resposta_resumo or "",
        "sql_executado": t.sql_executado,
        "filtros": t.filtros or {},
    } for t in reversed(trocas)]


def carregar_resumo(db: Session, conversa_id: uuid.UUID) -> list[str]:
    """Perguntas `ok` mais antigas que as 3 da memória (até 10, da mais antiga para a mais recente).

    Montado por código a partir do log, sem chamar o modelo: vai só para o agente, nunca para o front.
    """
    desde = datetime.now(timezone.utc) - JANELA_CONVERSA
    trocas = db.scalars(
        select(Interacao)
        .where(Interacao.conversa_id == conversa_id, Interacao.status == "ok", Interacao.criado_em >= desde)
        .order_by(Interacao.criado_em.desc(), Interacao.id.desc())
        .offset(MAX_TROCAS)
        .limit(MAX_RESUMO)
    ).all()
    return [(t.pergunta_interpretada or t.pergunta)[:RESUMO_PERGUNTA_MAX] for t in reversed(trocas)]


def contar_trocas(db: Session, conversa_id: uuid.UUID) -> int:
    """Trocas `ok` da conversa nas últimas 2 h; acima de MAX_TROCAS, o começo dela já saiu da memória do agente."""
    desde = datetime.now(timezone.utc) - JANELA_CONVERSA
    return db.scalar(
        select(func.count()).select_from(Interacao)
        .where(Interacao.conversa_id == conversa_id, Interacao.status == "ok", Interacao.criado_em >= desde)
    ) or 0


def apagar_antigas(db: Session) -> int:
    """Retenção de 30 dias (GENAI-11.4, 20.4). Devolve quantas linhas saíram."""
    apagadas = db.execute(delete(Interacao).where(Interacao.criado_em < datetime.now(timezone.utc) - RETENCAO))
    db.commit()
    return apagadas.rowcount
