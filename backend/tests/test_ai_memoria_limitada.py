"""GENAI-13: o agente sabe que só vê as 3 últimas trocas e não chama a mais antiga delas de "a primeira".

Caso real da Tela 7: depois de 4 perguntas (Recife, Olinda, residencial, P1), "E o primeiro município que
eu perguntei?" saiu "Olinda", porque Recife já tinha saído da memória.
"""
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.ai.agent import responder
from app.ai.contratos import RespostaAgente

HISTORICO = [
    {"pergunta_interpretada": f"Receita comercial de {m} em P2", "resposta_resumo": "R$ ...", "sql_executado": None}
    for m in ("Olinda", "Olinda residencial", "Olinda P1 x P2")
]


def test_instrucoes_avisam_que_a_memoria_tem_so_as_ultimas_3_trocas() -> None:
    instrucoes: list[str] = []

    def modelo(mensagens: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        instrucoes.append(next(m.instructions or "" for m in reversed(mensagens) if isinstance(m, ModelRequest)))
        saida = RespostaAgente(
            status="nao_sei", pergunta_interpretada="Primeiro município perguntado na conversa",
            texto="Só lembro das últimas 3 perguntas; a mais antiga que vejo é sobre Olinda. Qual município quer consultar?",
            justificativa="A primeira pergunta já saiu da memória.", confianca="alta")
        return ModelResponse(parts=[TextPart(content=saida.model_dump_json())])

    resposta = responder("E o primeiro município que eu perguntei?", historico=HISTORICO,
                         modelo=FunctionModel(modelo), executar_sql_fn=lambda sql: None)

    assert "NÃO é necessariamente a primeira" in instrucoes[0]
    assert resposta["status"] == "nao_sei"
