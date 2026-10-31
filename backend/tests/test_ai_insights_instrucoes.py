"""V1c (4a): instruções opcionais no escrever_insight. Sem elas, o prompt é o INSTRUCOES da receita, lido na chamada."""
import json

from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.models.function import FunctionModel

from app.ai import insights
from app.ai.insights import INSTRUCOES, construir_agente_insight, escrever_insight

SAIDA = {'titulo': 'Título', 'texto': 'O valor foi {valor}.'}


def modelo(vistas: list):
    """Guarda as instruções que chegaram ao modelo em cada chamada."""
    def chamar(mensagens, info):
        vistas.append(mensagens[-1].instructions)
        return ModelResponse(parts=[TextPart(content=json.dumps(SAIDA))])
    return FunctionModel(chamar)


def test_sem_instrucoes_o_modelo_recebe_as_da_receita():
    vistas = []
    assert escrever_insight({'valor': 'R$ 1,00'}, modelo=modelo(vistas)) == {
        'titulo': 'Título', 'texto': 'O valor foi R$ 1,00.'}
    assert vistas == [INSTRUCOES]


def test_com_instrucoes_o_modelo_recebe_as_passadas():
    vistas = []
    escrever_insight({'valor': 'R$ 1,00'}, modelo=modelo(vistas), instrucoes='Instruções da unidade.')
    assert vistas == ['Instruções da unidade.']


def test_sem_instrucoes_vale_o_INSTRUCOES_do_momento_da_chamada(monkeypatch):
    # O padrão é lido na chamada, não fixado na definição da função
    monkeypatch.setattr(insights, 'INSTRUCOES', 'Instruções trocadas.')
    vistas = []
    escrever_insight({'valor': 'R$ 1,00'}, modelo=modelo(vistas))
    assert vistas == ['Instruções trocadas.']
    vistas.clear()
    construir_agente_insight(modelo(vistas)).run_sync('Marcadores disponíveis:\n{valor} = R$ 1,00',
                                                      deps={'valor': 'R$ 1,00'})
    assert vistas == ['Instruções trocadas.']
