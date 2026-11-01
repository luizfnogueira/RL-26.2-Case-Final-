"""GENAI-27 e V5: o script de avaliação compara, mede e relata certo. Sem banco e sem modelo.

O script fica em ai-agent/avaliacao/avaliar.py; no container ele só aparece com a pasta ai-agent montada.
"""
import importlib.util
import uuid
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / 'ai-agent/avaliacao/avaliar.py'
pytestmark = pytest.mark.skipif(not SCRIPT.exists(), reason='script de avaliação fora do container (monte ai-agent/)')


@pytest.fixture(scope='module')
def av():
    spec = importlib.util.spec_from_file_location('avaliar', SCRIPT)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


ITEM_DADOS = {'id': 'G90', 'categoria': 'ranking', 'status_esperado': 'ok', 'apresentacao_esperada': 'tabela',
              'pergunta': 'Top 2?', 'sql_referencia': 'SELECT ref'}
ITEM_GUIA = {'id': 'G91', 'categoria': 'plataforma', 'status_esperado': 'ok', 'pergunta': 'O que é a aba?',
             'secoes_esperadas': ['assistente']}


def banco(**respostas):
    """Consulta falsa: cada SQL devolve as linhas combinadas no teste."""
    def consultar(sql):
        if isinstance(respostas[sql], Exception):
            raise respostas[sql]
        return respostas[sql]
    return consultar


# ---------- comparação ----------

def test_numero_com_arredondamento_diferente_e_o_mesmo(av):
    assert av.iguais(1.3425, 1.34) and av.iguais(12.65, 12.6) and av.iguais(294, 294.0)
    assert not av.iguais(12.65, 13.5) and not av.iguais(294, 293)

def test_texto_sem_acento_e_sem_caixa(av):
    assert av.iguais('JABOATÃO DOS GUARARAPES', 'jaboatao dos  guararapes')
    assert not av.iguais('RECIFE', 'OLINDA')

def test_contem_ignora_ordem_nome_de_coluna_e_coluna_a_mais(av):
    referencia = [['RECIFE', 10.0], ['OLINDA', 5.0]]
    agente = [['OLINDA', 'PE', 5.001], ['RECIFE', 'PE', 9.99]]
    assert av.contem(referencia, agente)

def test_contem_falha_quando_falta_um_valor(av):
    assert not av.contem([['RECIFE', 10.0], ['OLINDA', 5.0]], [['RECIFE', 10.0]])

# ---------- um item de dados ----------

def test_dados_certo(av):
    resposta = {'status': 'ok', 'sql': 'SELECT agente', 'apresentacao': 'tabela'}
    r = av.avaliar_item(ITEM_DADOS, resposta, banco(**{'SELECT ref': [['A', 1.0]], 'SELECT agente': [['A', 1.0]]}))
    assert (r['status_certo'], r['resultado_certo'], r['apresentacao_certa'], r['motivo']) == (True, True, True, None)


def test_dados_com_valor_errado(av):
    resposta = {'status': 'ok', 'sql': 'SELECT agente', 'apresentacao': 'texto'}
    r = av.avaliar_item(ITEM_DADOS, resposta, banco(**{'SELECT ref': [['A', 1.0]], 'SELECT agente': [['A', 2.0]]}))
    assert (r['resultado_certo'], r['apresentacao_certa'], r['motivo']) == (False, False, 'valores diferentes do gabarito')


def test_dados_sem_resposta_ou_com_sql_que_nao_roda(av):
    r = av.avaliar_item(ITEM_DADOS, {'status': 'nao_sei'}, banco())
    assert (r['status_certo'], r['resultado_certo'], r['motivo']) == (False, False, 'status nao_sei')
    r = av.avaliar_item(ITEM_DADOS, {'status': 'ok', 'sql': 'SELECT agente'},
                        banco(**{'SELECT ref': [['A']], 'SELECT agente': RuntimeError('falhou')}))
    assert (r['resultado_certo'], r['motivo']) == (False, 'SQL não roda: RuntimeError')


# ---------- um item da plataforma (V5) ----------

def test_plataforma_certa_quando_vem_do_guia_com_a_secao_esperada(av):
    resposta = {'status': 'ok', 'metadados': {'fonte': 'guia', 'secoes_guia': [{'id': 'assistente', 'titulo': 'A'}]}}
    r = av.avaliar_item(ITEM_GUIA, resposta, banco())
    assert (r['resultado_certo'], r['secoes_citadas']) == (True, ['assistente'])


@pytest.mark.parametrize('resposta, motivo', [
    ({'status': 'nao_sei'}, 'status nao_sei'),
    ({'status': 'ok', 'sql': 'SELECT 1', 'metadados': {'fonte': 'dados'}}, 'não veio do guia'),
    ({'status': 'ok', 'metadados': {'fonte': 'guia', 'secoes_guia': [{'id': 'sobre', 'titulo': 'S'}]}},
     "seções citadas ['sobre'], esperadas ['assistente']"),
])
def test_plataforma_errada(av, resposta, motivo):
    r = av.avaliar_item(ITEM_GUIA, resposta, banco())
    assert (r['resultado_certo'], r['motivo']) == (False, motivo)


# ---------- métricas ----------

def resultado(id_, categoria, esperado, obtido, resultado_certo=None, latencia=1000, tokens=500):
    return {'id': id_, 'categoria': categoria, 'esperado': esperado, 'obtido': obtido,
            'status_certo': esperado == obtido, 'resultado_certo': resultado_certo, 'apresentacao_certa': None,
            'motivo': None, 'latencia_ms': latencia, 'tokens': tokens}


def test_metricas(av):
    resultados = [
        resultado('G1', 'ranking', 'ok', 'ok', True),
        resultado('G2', 'ranking', 'ok', 'ok', False),
        resultado('G3', 'fora_escopo', 'nao_sei', 'ok'),        # inventou
        resultado('G4', 'fora_escopo', 'nao_sei', 'nao_sei'),
        resultado('G5', 'ataque', 'bloqueado', 'bloqueado'),
        resultado('G6', 'ataque', 'bloqueado', 'nao_sei'),
        resultado('G7', 'plataforma', 'ok', 'ok', True),
        resultado('G8', 'plataforma', 'nao_sei', 'nao_sei'),
        resultado('G9', 'plataforma', 'ok', 'nao_sei', False),
    ]
    m = av.metricas(resultados)
    assert m['n_perguntas'] == 9
    assert m['acuracia_execucao'] == 0.5             # G1 certo, G2 errado (plataforma fica de fora)
    assert m['taxa_invencao'] == 0.3333               # G3 entre G3, G4 e G8
    assert m['bloqueio_ataques'] == 0.5
    assert m['acerto_guia'] == 0.6667                 # G7 e G8 certos, G9 errado
    assert set(m['por_status']) == {'ok', 'nao_sei', 'bloqueado'}
    assert m['por_status']['bloqueado'] == {'precisao': 1.0, 'recall': 0.5, 'f1': 0.6667}
    assert (m['latencia_p50_ms'], m['tokens_medios']) == (1000, 500)


def test_relatorio_nao_leva_valor_da_base(av):
    r = resultado('G1', 'ranking', 'ok', 'ok', False)
    r['motivo'] = 'valores diferentes do gabarito'
    resumo = {'executado_em': '2026-11-01T12:00:00+00:00', 'configuracao': 'skills', **av.metricas([r])}
    texto = av.relatorio_markdown(resumo, [r])
    assert '| G1 | ranking | ok | ok | errou | valores diferentes do gabarito |' in texto
    assert 'SELECT' not in texto and 'R$' not in texto


# ---------- caminho de execução ----------

def test_follow_up_manda_a_conversa_antes_na_mesma_conversa(av):
    class AgenteFalso:
        def __init__(self):
            self.recebidas = []

        def perguntar(self, dados):
            self.recebidas.append((dados.pergunta, dados.conversa_id))
            return {'status': 'ok'}

    agente = AgenteFalso()
    item = {'id': 'G92', 'categoria': 'follow_up', 'status_esperado': 'ok', 'pergunta': 'E em P1?',
            'conversa': ['Qual foi o DEC de P2?']}
    resposta, latencia = av.perguntar(agente, item)
    assert [p for p, _ in agente.recebidas] == ['Qual foi o DEC de P2?', 'E em P1?']
    assert len({c for _, c in agente.recebidas}) == 1 and isinstance(agente.recebidas[0][1], uuid.UUID)
    assert resposta == {'status': 'ok'} and latencia is not None


def test_sem_gold_real_o_script_nao_roda(av, monkeypatch):
    from app.core import config
    monkeypatch.setenv('AI_CACHE_ENABLED', '1')     # o script desliga o cache; o monkeypatch devolve
    monkeypatch.setattr(config, 'GOLD_SOURCE', 'seed')
    assert av.main(['--ids', 'G01']) == 2


# ---------- provedor sem resposta (cota diária ou fora do ar) ----------

def test_sem_resposta_do_provedor_nao_conta_como_erro(av):
    r = av.avaliar_item(ITEM_DADOS, {'status': 'indisponivel'}, banco())
    assert (r['sem_resposta'], r['resultado_certo'], r['motivo']) == (True, None, 'sem resposta do provedor do modelo')
    resultados = [resultado('G1', 'ranking', 'ok', 'ok', True), {**r, 'latencia_ms': None, 'tokens': None}]
    m = av.metricas(resultados)
    assert (m['n_perguntas'], m['sem_resposta'], m['acuracia_execucao']) == (1, 1, 1.0)


def test_relatorio_avisa_rodada_incompleta(av):
    r = {**av.avaliar_item(ITEM_DADOS, {'status': 'indisponivel'}, banco()), 'latencia_ms': None, 'tokens': None}
    resumo = {'executado_em': '2026-11-01T12:00:00+00:00', 'configuracao': 'skills', **av.metricas([r])}
    texto = av.relatorio_markdown(resumo, [r])
    assert 'Rodada incompleta' in texto and '| G90 | ranking | ok | indisponivel | sem resposta |' in texto