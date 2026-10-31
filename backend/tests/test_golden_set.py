"""GENAI-26: o golden set (ai-agent/avaliacao/perguntas.yaml) está bem formado e todo gabarito roda.

No container, o arquivo só aparece com a pasta ai-agent montada (veja o comando no ai-agent/README.md).
"""
from collections import Counter
from pathlib import Path

import pytest
import yaml

from app.ai.guardrails import triar
from app.ai.validador import validar_sql
from app.services import esclarecimento_ia
from app.services.guia_plataforma import carregar_guia, secoes_para
from .banco_do_agente import precisa_da_gold_real

GOLDEN_SET = Path(__file__).resolve().parents[2] / 'ai-agent/avaliacao/perguntas.yaml'
CATEGORIAS = {'liderancas', 'dia_a_dia', 'near_miss', 'regra_negocio', 'premissa_falsa',
              'ambiguidade', 'follow_up', 'ranking', 'fora_escopo', 'ataque', 'plataforma'}
STATUS = {'ok', 'nao_sei', 'bloqueado', 'esclarecer'}

pytestmark = pytest.mark.skipif(not GOLDEN_SET.exists(), reason='golden set fora do container (monte ai-agent/)')


def itens() -> list[dict]:
    return yaml.safe_load(GOLDEN_SET.read_text(encoding='utf-8'))['perguntas']


def com_sql() -> list[dict]:
    return [i for i in itens() if tem_sql(i)] if GOLDEN_SET.exists() else []


def tem_sql(item: dict) -> bool:
    """Resposta ok sobre os dados tem SQL; resposta ok sobre a plataforma tem seções do guia."""
    return item['status_esperado'] == 'ok' and item['categoria'] != 'plataforma'


def da_plataforma(*status: str) -> list[dict]:
    if not GOLDEN_SET.exists():
        return []
    return [i for i in itens() if i['categoria'] == 'plataforma' and i['status_esperado'] in status]


def incompleta(id_secao: str) -> bool:
    return '[COMPLETAR' in carregar_guia().secao(id_secao).texto


def test_cada_item_tem_os_campos_certos():
    vistos = set()
    for item in itens():
        assert item['id'] not in vistos, f'id repetido: {item["id"]}'
        vistos.add(item['id'])
        assert item['categoria'] in CATEGORIAS, item['id']
        assert item['status_esperado'] in STATUS, item['id']
        assert item.get('apresentacao_esperada') in (None, 'texto', 'tabela'), item['id']
        assert all(isinstance(p, str) for p in item.get('conversa', [])), item['id']
        # Gabarito em SQL só nos itens ok de dados; seções do guia só nos itens da plataforma
        assert bool(item.get('sql_referencia')) == tem_sql(item), item['id']
        if item['categoria'] == 'plataforma':
            secoes = item.get('secoes_esperadas', [])
            assert isinstance(secoes, list) and all(isinstance(s, str) for s in secoes), item['id']
            assert bool(secoes) or item['status_esperado'] != 'ok', f'{item["id"]}: ok sem secoes_esperadas'
        else:
            assert 'secoes_esperadas' not in item, item['id']


def test_cada_categoria_tem_pelo_menos_3_itens():
    contagem = Counter(item['categoria'] for item in itens())
    assert {c: contagem[c] for c in CATEGORIAS if contagem[c] < 3} == {}
    assert 40 <= sum(contagem.values()) <= 70


@pytest.mark.parametrize('item', com_sql(), ids=lambda i: i['id'])
def test_gabarito_passa_no_validador_do_agente(item):
    validar_sql(item['sql_referencia'])


@pytest.mark.parametrize('item', [i for i in itens() if i['status_esperado'] in ('ok', 'esclarecer')
                                  or (i['categoria'] == 'plataforma' and i['status_esperado'] != 'bloqueado')]
                         if GOLDEN_SET.exists() else [], ids=lambda i: i['id'])
def test_pre_filtro_nao_barra_pergunta_legitima(item):
    assert triar(item['pergunta']).acao == 'seguir'


def test_este_ano_pede_esclarecimento():
    for item in itens():
        if item['status_esperado'] == 'esclarecer' and 'ano' in item['pergunta']:
            assert esclarecimento_ia.detectar(item['pergunta'], [], {}) is not None, item['id']


@precisa_da_gold_real
@pytest.mark.parametrize('item', com_sql(), ids=lambda i: i['id'])
def test_gabarito_roda_no_banco_real(item):
    from app.ai.consulta import executar_consulta
    resultado = executar_consulta(item['sql_referencia'])
    assert resultado.n_linhas > 0 and not resultado.truncado
    assert all(v is not None for linha in resultado.linhas for v in linha), item['id']


# Categoria plataforma (V4): o gabarito são as seções do guia

@pytest.mark.parametrize('item', da_plataforma('ok', 'nao_sei'), ids=lambda i: i['id'])
def test_secoes_esperadas_existem_no_guia(item):
    guia = carregar_guia()
    faltando = [s for s in item.get('secoes_esperadas', []) if guia.secao(s) is None]
    assert not faltando, f'{item["id"]}: seção que não existe no guia: {faltando}'


@pytest.mark.parametrize('item', da_plataforma('ok', 'nao_sei'), ids=lambda i: i['id'])
def test_leitor_do_guia_entrega_as_secoes_esperadas(item):
    """O agente do guia só pode citar o que recebeu: as seções esperadas têm de estar entre as escolhidas."""
    entregues = {s.id for s in secoes_para(item['pergunta'])}
    assert set(item.get('secoes_esperadas', [])) <= entregues, (item['id'], entregues)


@pytest.mark.parametrize('item', da_plataforma('ok'), ids=lambda i: i['id'])
def test_item_ok_so_cita_secao_escrita(item):
    pendentes = [s for s in item['secoes_esperadas'] if incompleta(s)]
    assert not pendentes, f'{item["id"]}: seção com [COMPLETAR] não responde; deixe o item nao_sei: {pendentes}'


@pytest.mark.parametrize('item', [i for i in da_plataforma('nao_sei') if i.get('secoes_esperadas')],
                         ids=lambda i: i['id'])
def test_item_nao_sei_vira_ok_quando_a_secao_for_escrita(item):
    escritas = [s for s in item['secoes_esperadas'] if not incompleta(s)]
    assert not escritas, f'{item["id"]}: a seção {escritas} já foi escrita; mude o status para ok'