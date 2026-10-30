"""GENAI-26: o golden set (ai-agent/avaliacao/perguntas.yaml) está bem formado e todo gabarito roda.

No container, o arquivo só aparece com a pasta ai-agent montada (veja o comando no ai-agent/README.md).
"""
from collections import Counter
from pathlib import Path

import pytest
import yaml

from app.ai.guardrails import triar
from app.ai.validador import validar_sql
from app.core import config
from app.services import esclarecimento_ia

GOLDEN_SET = Path(__file__).resolve().parents[2] / 'ai-agent/avaliacao/perguntas.yaml'
CATEGORIAS = {'liderancas', 'dia_a_dia', 'near_miss', 'regra_negocio', 'premissa_falsa',
              'ambiguidade', 'follow_up', 'ranking', 'fora_escopo', 'ataque'}
STATUS = {'ok', 'nao_sei', 'bloqueado', 'esclarecer'}

pytestmark = pytest.mark.skipif(not GOLDEN_SET.exists(), reason='golden set fora do container (monte ai-agent/)')


def itens() -> list[dict]:
    return yaml.safe_load(GOLDEN_SET.read_text(encoding='utf-8'))['perguntas']


def com_sql() -> list[dict]:
    return [i for i in itens() if i['status_esperado'] == 'ok'] if GOLDEN_SET.exists() else []


def test_cada_item_tem_os_campos_certos():
    vistos = set()
    for item in itens():
        assert item['id'] not in vistos, f'id repetido: {item["id"]}'
        vistos.add(item['id'])
        assert item['categoria'] in CATEGORIAS, item['id']
        assert item['status_esperado'] in STATUS, item['id']
        assert item.get('apresentacao_esperada') in (None, 'texto', 'tabela'), item['id']
        assert all(isinstance(p, str) for p in item.get('conversa', [])), item['id']
        # Só resposta ok tem gabarito em SQL
        assert bool(item.get('sql_referencia')) == (item['status_esperado'] == 'ok'), item['id']


def test_cada_categoria_tem_pelo_menos_3_itens():
    contagem = Counter(item['categoria'] for item in itens())
    assert {c: contagem[c] for c in CATEGORIAS if contagem[c] < 3} == {}
    assert 40 <= sum(contagem.values()) <= 60


@pytest.mark.parametrize('item', com_sql(), ids=lambda i: i['id'])
def test_gabarito_passa_no_validador_do_agente(item):
    validar_sql(item['sql_referencia'])


@pytest.mark.parametrize('item', [i for i in itens() if i['status_esperado'] in ('ok', 'esclarecer')]
if GOLDEN_SET.exists() else [], ids=lambda i: i['id'])
def test_pre_filtro_nao_barra_pergunta_legitima(item):
    assert triar(item['pergunta']).acao == 'seguir'


def test_este_ano_pede_esclarecimento():
    for item in itens():
        if item['status_esperado'] == 'esclarecer' and 'ano' in item['pergunta']:
            assert esclarecimento_ia.detectar(item['pergunta'], [], {}) is not None, item['id']


@pytest.mark.skipif(not config.AGENTE_DB_PASSWORD, reason='precisa da Gold carregada e do usuário do agente')
@pytest.mark.parametrize('item', com_sql(), ids=lambda i: i['id'])
def test_gabarito_roda_no_banco_real(item):
    from app.ai.consulta import executar_consulta
    resultado = executar_consulta(item['sql_referencia'])
    assert resultado.n_linhas > 0 and not resultado.truncado
    assert all(v is not None for linha in resultado.linhas for v in linha), item['id']