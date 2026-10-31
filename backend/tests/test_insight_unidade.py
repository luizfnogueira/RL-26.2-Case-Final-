"""V1c: POST /ia/insight com contexto=unidade (Gold real com repository simulado, seed no stub, receita igual)."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.encoders import jsonable_encoder
from fastapi.testclient import TestClient

from app.core import config
from app.main import app
from app.repositories.unidade_repository import ContaMes, FaturaUC, GeracaoDistribuidaUC
from app.services import insight_unidade
from app.services.fatos_unidade import carregar_fatos_unidade, montar_fatos_unidade
from app.services.insight_service import PREFIXO_TEXTO_ALTERNATIVO
from app.services.insight_unidade import OBSERVACAO_SEM_IA
from app.services.stubs import exemplo
from app.services.texto_unidade import texto_por_regra_unidade
from tests.test_diagnostico_conta import _mes, historico
from tests.test_fatos_unidade import ESTAVEL, RepositorioComContas, por_preco
from tests.test_insight import GeradorFixo, gold_falsa, usar  # noqa: F401  (gold_falsa é autouse: get_db sem banco)
from tests.test_unidade_service import METADADOS

client = TestClient(app)
PERIODO = '2025-07/2026-06'
PEDIDO = {'contexto': 'unidade', 'id_uc': 'UC-1', 'filtros': {'periodo_atual': PERIODO}}


@pytest.fixture
def real(monkeypatch):
    """GOLD_SOURCE=real, IA_MODO=mock e o repository da Visão 360 trocado por um falso (sem banco)."""
    monkeypatch.setattr(config, 'GOLD_SOURCE', 'real')
    monkeypatch.setattr(config, 'IA_MODO', 'mock')

    def usar_repositorio(repo):
        monkeypatch.setattr(insight_unidade, 'repositorio', lambda db: repo)
        return repo
    return usar_repositorio


def pedir(**mudancas):
    return client.post('/ia/insight', json={**PEDIDO, **mudancas})


def esperado(repo, periodo=PERIODO) -> dict:
    """O que a rota deve devolver: os mesmos fatos e o mesmo texto por regra, mais a observação."""
    r = texto_por_regra_unidade(carregar_fatos_unidade(repo, 'UC-1', periodo), repo.metadados())
    return {**r, 'metadados': {**r['metadados'], 'observacoes': [*r['metadados']['observacoes'], OBSERVACAO_SEM_IA]}}


def sem_horario(resposta: dict) -> dict:
    return {k: v for k, v in jsonable_encoder(resposta).items() if k != 'gerado_em'}


# ---------- modo real ----------

def test_uc_com_motivo_sai_com_os_fatos_e_o_texto_por_regra(real):
    repo = real(RepositorioComContas(conta=por_preco(412, 298, 0.8), meses=historico()))
    resposta = pedir()
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert sem_horario(corpo) == sem_horario(esperado(repo))
    assert 'O consumo subiu 38%' in corpo['texto']
    assert {n['nome'] for n in corpo['numeros_utilizados']} >= {'valor_conta_mes', 'variacao_consumo_ano_anterior'}


def test_uc_sem_motivo(real):
    repo = real(RepositorioComContas(conta=por_preco(305, 298, 0.8), meses=historico(**ESTAVEL)))
    corpo = pedir().json()
    assert sem_horario(corpo) == sem_horario(esperado(repo))
    assert corpo['titulo'] == 'Valor da conta estável'


def test_resposta_marcada_como_texto_alternativo_pelo_prefixo_da_receita(real):
    real(RepositorioComContas())
    observacoes = pedir().json()['metadados']['observacoes']
    assert observacoes[0] == METADADOS['observacoes'][0]                  # os metadados da Gold, primeiro
    assert observacoes[-1].startswith(PREFIXO_TEXTO_ALTERNATIVO)
    assert sum(o.startswith(PREFIXO_TEXTO_ALTERNATIVO) for o in observacoes) == 1


def test_indicadores_enviados_nao_mudam_a_resposta(real):
    real(RepositorioComContas(conta=por_preco(412, 298, 0.8), meses=historico()))
    sem = pedir(indicadores=[]).json()
    inventados = [{'nome': 'valor_conta_mes', 'rotulo': 'Valor da conta', 'valor': 1.0, 'unidade': 'BRL',
                   'periodo_referencia': '2026-06'},
                  {'nome': 'ultimo_mes', 'rotulo': 'Último mês', 'valor': 9999.0, 'unidade': 'kWh',
                   'periodo_referencia': '2026-06'}]
    com = pedir(indicadores=inventados)
    assert com.status_code == 200, com.text
    assert sem_horario(com.json()) == sem_horario(sem)


def test_uc_inexistente_da_404(real):
    real(RepositorioComContas())
    resposta = pedir(id_uc='UC-NAO-EXISTE')
    assert (resposta.status_code, resposta.json()['codigo']) == (404, 'UC_INEXISTENTE')


def test_gold_nao_carregada_da_503(real):
    real(RepositorioComContas(ultimo=None))
    resposta = pedir()
    assert (resposta.status_code, resposta.json()['codigo']) == (503, 'GOLD_NAO_CARREGADA')


@pytest.mark.parametrize('periodo', ['2026-06', '2025-01/2026-06'])
def test_periodo_que_nao_tem_12_meses_da_422(real, periodo):
    real(RepositorioComContas())
    resposta = pedir(filtros={'periodo_atual': periodo})
    assert (resposta.status_code, resposta.json()['codigo']) == (422, 'DADOS_INVALIDOS')


def test_periodo_informado_e_respeitado(real):
    repo = real(RepositorioComContas())
    pedir(filtros={'periodo_atual': '2024-07/2025-06'})
    assert repo.chamadas['consumo'] == ('2023-07', '2025-06')


# ---------- seed e receita ----------

def test_seed_continua_no_stub(monkeypatch):
    monkeypatch.setattr(config, 'GOLD_SOURCE', 'seed')
    resposta = client.post('/ia/insight', json=exemplo('pedido_insight_unidade'))
    assert resposta.json() == exemplo('resposta_insight_unidade')


@pytest.mark.parametrize('fonte', ['seed', 'real'])
def test_receita_tem_o_mesmo_resultado_nas_duas_fontes(monkeypatch, fonte):
    usar(GeradorFixo({'titulo': 'Preço sustentou a receita', 'texto': 'Texto do módulo.'}))
    monkeypatch.setattr(config, 'GOLD_SOURCE', 'seed')
    antes = client.post('/ia/insight', json={**exemplo('pedido_insight'), 'indicadores': []})
    monkeypatch.setattr(config, 'GOLD_SOURCE', fonte)
    depois = client.post('/ia/insight', json={**exemplo('pedido_insight'), 'indicadores': []})
    assert depois.status_code == antes.status_code == 200
    assert sem_horario(depois.json()) == sem_horario(antes.json())
    assert depois.json()['titulo'] == 'Preço sustentou a receita'


# ---------- exemplo do contrato (fictício) ----------

def exemplo_real() -> dict:
    """Resposta do modo real sobre a UC-DEMO-001 do contrato (fictícia), montada pelas próprias funções.

    O consumo é o de unidade.json; o valor de jun/2025, que fica fora da janela do exemplo, é inventado.
    """
    unidade = exemplo('unidade')
    meses = []
    for c in unidade['consumo']:
        atual, anterior = c['atual']['valor'], c['ano_anterior']['valor']
        if atual is not None:
            meses.append(_mes(c['mes'], atual, None if anterior is None else Decimal(str(anterior)),
                              tipo=c['tipo_leitura']))
        if anterior is not None:
            meses.append(_mes(c['ano_anterior']['periodo_referencia'], anterior))
    contas = [ContaMes('2025-06', Decimal('342.70'), 'VERMELHA P1'), ContaMes('2026-06', Decimal('486.00'), 'AMARELA')]
    g = unidade['geracao_distribuida']
    gd = GeracaoDistribuidaUC(Decimal(str(g['potencia_kwp'])), g['modalidade'], date.fromisoformat(g['data_conexao']),
                              Decimal(str(g['energia_injetada_media_mensal']['valor'])))
    abertas = [FaturaUC(f['id_fatura'], f['mes_referencia'], Decimal(str(f['valor_energia'])),
                        Decimal(str(f['tributos'])), Decimal(str(f['valor_total'])), f['bandeira_tarifaria'],
                        date.fromisoformat(f['data_emissao']), date.fromisoformat(f['data_vencimento']), None,
                        f['status']) for f in unidade['faturas_abertas']]
    fatos = montar_fatos_unidade(meses, unidade['periodo_referencia'], contas, gd, abertas)
    metadados = {'dados_ficticios': True, 'gold_atualizada_em': '2026-10-21T06:15:00-03:00',
                 'observacoes': ['Dados fictícios do exemplo do contrato; no modo real, vêm da carga da Gold.']}
    resposta = texto_por_regra_unidade(fatos, metadados,
                                       datetime(2026, 10, 21, 6, 20, tzinfo=timezone(timedelta(hours=-3))))
    resposta['metadados']['observacoes'].append(OBSERVACAO_SEM_IA)
    return jsonable_encoder(resposta)


def test_fixture_do_modo_real_e_o_que_as_funcoes_produzem():
    assert exemplo('resposta_insight_unidade_real') == exemplo_real()
