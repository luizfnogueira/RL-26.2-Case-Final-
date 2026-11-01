"""GENAI-13: memória de 3 trocas completas + resumo das perguntas anteriores (até 10), sem chamar o modelo.

Caso real da Tela 7: depois de 4 perguntas (Recife, Olinda, residencial, P1), "E o primeiro município que
eu perguntei?" saía "Olinda", porque Recife já tinha saído da memória. Com o resumo, Recife chega ao agente.
"""
import os
import uuid

import pytest
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.ai.agent import converter_historico_para_mensagens, responder
from app.ai.contratos import RespostaAgente
from app.db import seed
from app.repositories import interacao_repository
from app.services.stubs import exemplo

HISTORICO = [
    {"pergunta_interpretada": f"Receita {p}", "resposta_resumo": "R$ ...", "sql_executado": None}
    for p in ("comercial de Olinda em P2", "residencial de Olinda em P2", "residencial de Olinda, P1 x P2")
]
RESUMO = ["Receita comercial de Recife em P2"]


def test_resumo_entra_antes_das_3_trocas_completas():
    mensagens = converter_historico_para_mensagens(HISTORICO, RESUMO)
    primeira = mensagens[0].parts[0].content
    assert primeira.startswith("Perguntas anteriores desta conversa") and "1. Receita comercial de Recife em P2" in primeira
    assert len(mensagens) == 2 + 2 * len(HISTORICO)
    assert converter_historico_para_mensagens(HISTORICO, None)[0].parts[0].content == "Receita comercial de Olinda em P2"


def test_agente_recebe_o_resumo_e_a_regra_de_usar_a_lista():
    vistos: list[tuple[str, list[str]]] = []

    def modelo(mensagens: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        pedidos = [m for m in mensagens if isinstance(m, ModelRequest)]
        textos = [p.content for m in pedidos for p in m.parts if isinstance(p, UserPromptPart)]
        vistos.append((pedidos[-1].instructions or "", textos))
        saida = RespostaAgente(
            status="nao_sei", pergunta_interpretada="Primeiro município perguntado na conversa",
            texto="O primeiro município que você perguntou foi Recife.", justificativa="Lista do resumo.",
            confianca="alta")
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    responder("E o primeiro município que eu perguntei?", historico=HISTORICO, resumo_conversa=RESUMO,
              modelo=FunctionModel(modelo), executar_sql_fn=lambda sql: None)

    instrucoes, textos = vistos[0]
    assert "o 1º item dela" in instrucoes
    assert "Receita comercial de Recife em P2" in textos[0]


URL_TESTE = os.getenv("TEST_DATABASE_URL")


@pytest.mark.skipif(not URL_TESTE, reason="defina TEST_DATABASE_URL para testar contra o PostgreSQL")
def test_resumo_traz_as_perguntas_anteriores_as_3_da_memoria_da_mais_antiga_para_a_mais_recente():
    engine = create_engine(URL_TESTE)
    seed.preparar_schemas(engine)
    conversa = uuid.uuid4()
    ok = exemplo("resposta_ia")
    try:
        with Session(bind=engine) as db:
            for i in range(1, 6):
                resposta = {**ok, "detalhes_tecnicos": {**ok["detalhes_tecnicos"], "estrutura_pensamento": {
                    **ok["detalhes_tecnicos"]["estrutura_pensamento"], "pergunta_interpretada": f"Pergunta {i}"}}}
                interacao_repository.registrar(db, conversa, f"Pergunta {i}", resposta)
            interacao_repository.registrar(db, conversa, "DROP TABLE", exemplo("resposta_ia_bloqueado"))
            assert [t["pergunta_interpretada"] for t in interacao_repository.carregar_historico(db, conversa)] == [
                "Pergunta 3", "Pergunta 4", "Pergunta 5"]
            assert interacao_repository.carregar_resumo(db, conversa) == ["Pergunta 1", "Pergunta 2"]
            assert interacao_repository.contar_trocas(db, conversa) == 5
            db.execute(text("DELETE FROM ia.interacao WHERE conversa_id = :c"), {"c": conversa})
            db.commit()
    finally:
        engine.dispose()
