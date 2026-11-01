"""L3: pergunta sobre a plataforma vai da ponte do POST /ia para o agente do guia, sem encostar no banco.

O agente do guia e o de dados são falsos aqui: nenhum teste gasta tokens.
"""
from contextlib import nullcontext

import pytest
from fastapi.testclient import TestClient

from app.ai.agente_guia import RespostaGuia
from app.main import app
from app.schemas.ia import RespostaIA
from app.services import ia_service
from app.services.ia_service import MENSAGEM_GUIA_SEM_SECAO, AgenteReal, obter_agente

client = TestClient(app)
PERGUNTA_GUIA = 'O que é a aba Assistente V-Energy?'
PERGUNTA_DADOS = 'Qual foi a receita de Olinda em P2?'


@pytest.fixture
def log(monkeypatch):
    """Memória e log em lista, sem PostgreSQL."""
    gravadas = []
    monkeypatch.setenv('AI_CACHE_ENABLED', '0')
    monkeypatch.setattr(ia_service.interacao_repository, 'carregar_historico', lambda db, conversa: [])
    monkeypatch.setattr(ia_service.interacao_repository, 'carregar_resumo', lambda db, conversa: [])
    monkeypatch.setattr(ia_service.interacao_repository, 'registrar',
                        lambda db, conversa, pergunta, resposta: gravadas.append(resposta))
    yield gravadas
    app.dependency_overrides.pop(obter_agente, None)


class GuiaFalso:
    def __init__(self, saida: RespostaGuia):
        self.saida, self.chamadas = saida, []

    def __call__(self, pergunta, secoes, historico):
        self.chamadas.append((pergunta, [s.id for s in secoes], historico))
        return self.saida


def nao_chamar(*args, **kwargs):
    raise AssertionError('o agente de dados não deveria ser chamado')


def agente(guia, responder=nao_chamar) -> AgenteReal:
    return AgenteReal(responder=responder, executar_sql=nao_chamar, sessao=nullcontext, responder_guia=guia)


def test_pergunta_da_plataforma_responde_pelo_guia_sem_sql(log):
    guia = GuiaFalso(RespostaGuia(status='ok', texto='Abra o menu IA & dados.', secoes_usadas=['assistente']))
    app.dependency_overrides[obter_agente] = lambda: agente(guia)
    corpo = client.post('/ia', json={'pergunta': PERGUNTA_GUIA}).json()
    RespostaIA.model_validate(corpo)
    assert corpo['status'] == 'ok' and corpo['sql'] is None and corpo['dados'] == {'colunas': [], 'linhas': []}
    assert corpo['metadados']['fonte'] == 'guia'
    assert corpo['metadados']['secoes_guia'] == [{'id': 'assistente', 'titulo': 'Assistente V-Energy'}]
    assert 'assistente' in guia.chamadas[0][1]
    assert log and log[0]['metadados']['fonte'] == 'guia'


def test_secao_que_o_leitor_nao_entregou_vira_nao_sei(log):
    guia = GuiaFalso(RespostaGuia(status='ok', texto='Veja a tela de metas.', secoes_usadas=['metas']))
    resposta = agente(guia).perguntar(ia_service.PerguntaIA(pergunta=PERGUNTA_GUIA))
    assert (resposta['status'], resposta['resposta']) == ('nao_sei', MENSAGEM_GUIA_SEM_SECAO)
    assert resposta['metadados']['secoes_guia'] == [] and resposta['metadados']['fonte'] == 'guia'


def test_nao_sei_do_guia_passa_como_esta(log):
    guia = GuiaFalso(RespostaGuia(status='nao_sei', texto='Não encontrei isso no guia.', secoes_usadas=[]))
    resposta = agente(guia).perguntar(ia_service.PerguntaIA(pergunta='Como abro a tela de Metas comerciais?'))
    RespostaIA.model_validate(resposta)
    assert resposta['status'] == 'nao_sei' and resposta['metadados']['fonte'] == 'guia'


def test_pergunta_de_dados_nao_passa_pelo_guia(log):
    def guia_proibido(*args):
        raise AssertionError('o guia não deveria ser chamado')

    vistos = []

    def dados(pergunta, **kwargs):
        vistos.append(pergunta)
        raise RuntimeError('fim do teste')

    with pytest.raises(ia_service.AgenteIndisponivelException):
        agente(guia_proibido, responder=dados).perguntar(ia_service.PerguntaIA(pergunta=PERGUNTA_DADOS))
    assert vistos == [PERGUNTA_DADOS]


def test_pergunta_sobre_a_parte_interna_nem_chega_ao_guia(log):
    def guia_proibido(*args):
        raise AssertionError('o guia não deveria ser chamado')

    resposta = agente(guia_proibido).perguntar(ia_service.PerguntaIA(pergunta='Qual a senha do banco de dados?'))
    assert resposta['status'] == 'bloqueado'


def test_follow_up_leva_o_historico_ao_guia(log, monkeypatch):
    historico = [{'pergunta_interpretada': PERGUNTA_GUIA, 'resposta_resumo': 'É o chat.', 'sql_executado': None,
                  'filtros': {'fonte': 'guia', 'secoes_guia': ['assistente']}}]
    monkeypatch.setattr(ia_service.interacao_repository, 'carregar_historico', lambda db, conversa: historico)
    guia = GuiaFalso(RespostaGuia(status='ok', texto='Clique em Exportar CSV.', secoes_usadas=['assistente']))
    # Sozinha, "E como eu exporto?" não diz que é sobre a plataforma: a resposta anterior do guia diz
    agente(guia).perguntar(ia_service.PerguntaIA(pergunta='E como eu exporto?'))
    assert guia.chamadas[0][2] == historico


def test_follow_up_de_dados_depois_do_guia_vai_para_os_dados(log, monkeypatch):
    historico = [{'pergunta_interpretada': PERGUNTA_GUIA, 'resposta_resumo': 'É o chat.', 'sql_executado': None,
                  'filtros': {'fonte': 'guia', 'secoes_guia': ['assistente']}}]
    monkeypatch.setattr(ia_service.interacao_repository, 'carregar_historico', lambda db, conversa: historico)

    def guia_proibido(*args):
        raise AssertionError('o guia não deveria ser chamado')

    vistos = []

    def dados(pergunta, **kwargs):
        vistos.append(pergunta)
        raise RuntimeError('fim do teste')

    with pytest.raises(ia_service.AgenteIndisponivelException):
        agente(guia_proibido, responder=dados).perguntar(ia_service.PerguntaIA(pergunta='E qual a receita de Olinda em P2?'))
    assert vistos == ['E qual a receita de Olinda em P2?']


def test_log_da_resposta_do_guia_guarda_fonte_e_secoes():
    from app.repositories import interacao_repository

    class Banco:
        def __init__(self):
            self.linhas = []

        def add(self, linha):
            self.linhas.append(linha)

        def commit(self):
            pass

    guia = GuiaFalso(RespostaGuia(status='ok', texto='Abra o menu.', secoes_usadas=['assistente']))
    from app.services.guia_plataforma import secoes_para
    resposta = ia_service.resposta_do_guia(guia.saida, secoes_para(PERGUNTA_GUIA), None)
    banco = Banco()
    interacao_repository.registrar(banco, None, PERGUNTA_GUIA, resposta)
    assert banco.linhas[0].filtros == {'fonte': 'guia', 'secoes_guia': ['assistente']}
    assert banco.linhas[0].sql_executado is None