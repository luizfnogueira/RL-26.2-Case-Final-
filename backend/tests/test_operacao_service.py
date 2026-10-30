"""R1a: contas manuais sobre meses com Cc variável, sem depender de PostgreSQL."""
from copy import deepcopy
from decimal import Decimal as D

import pytest

from app.schemas.operacao import FiltrosOperacao, Operacao
from app.services import operacao_service as service

PERIODO = '2026-05/2026-06'


def meses_exemplo():
    # alimentador, mês, Cc, DEC, FEC, CHI, interrupções, DEC/FEC sem dia crítico.
    entradas = [
        ('ALM-A', '2026-05', 100, '1', '.2', '100', 20, '.4', '.1', 'RECIFE'),
        ('ALM-A', '2026-06', 200, '3', '.5', '600', 100, '2', '.3', 'RECIFE'),
        ('ALM-B', '2026-05', 300, '3', '.4', '900', 120, '1', '.2', 'RECIFE'),
        ('ALM-B', '2026-06', 100, '1', '.1', '100', 10, '1', '.1', 'RECIFE'),
        ('ALM-C', '2026-05', 50, '0', '0', '0', 0, '0', '0', 'OLINDA'),
        ('ALM-C', '2026-06', 50, '0', '0', '0', 0, '0', '0', 'OLINDA'),
    ]
    return [dict(alimentador=a, mes_referencia=m, ucs_atendidas=cc, dec=D(dec), fec=D(fec),
                 horas_interrupcao=D(chi), interrupcoes=i, dec_sem_dia_critico=D(ds),
                 fec_sem_dia_critico=D(fs), municipio=mun)
            for a, m, cc, dec, fec, chi, i, ds, fs, mun in entradas]


BAIRROS = {'ALM-A': ['CENTRO', 'COMPARTILHADO'],
           'ALM-B': ['BAIRRO COM, VIRGULA', 'COMPARTILHADO'], 'ALM-C': ['CENTRO']}


@pytest.fixture
def consultar(monkeypatch):
    monkeypatch.setattr(service, 'GOLD_SOURCE', 'real')
    monkeypatch.setattr(service.repo, 'consultar_meses', lambda db, filtros: meses_exemplo())
    monkeypatch.setattr(service.repo, 'consultar_bairros', lambda db, nomes: deepcopy(BAIRROS))
    monkeypatch.setattr(service, 'metadados_gold', lambda *args: {
        'dados_ficticios': True, 'gold_atualizada_em': None,
        'observacoes': ['Dados exclusivamente sintéticos do teste.'],
    })

    def obter(**params):
        resposta = service.montar_operacao(None, FiltrosOperacao(periodo_atual=PERIODO, **params))
        # Mesmo schema que valida a resposta HTTP, inclusive ausências.
        return Operacao.model_validate(resposta).model_dump(mode='json')
    return obter


def test_totais_do_alimentador_e_retrato_de_ucs_no_ultimo_mes(consultar):
    dados = consultar()
    a, b, c = dados['ranking_alimentadores']['items']
    assert [r['alimentador'] for r in (a, b, c)] == ['ALM-A', 'ALM-B', 'ALM-C']
    assert (a['dec']['valor'], a['fec']['valor'], a['interrupcoes']['valor'], a['horas_interrupcao']['valor']) == (4, .7, 120, 700)
    assert (a['dec_sem_dia_critico']['valor'], a['fec_sem_dia_critico']['valor']) == (2.4, .4)
    assert a['ucs_atendidas'] == 200
    assert b['ucs_atendidas'] == 100  # não é o máximo (300) nem a soma dos meses (400)
    assert a['bairros_atendidos'] == ['CENTRO', 'COMPARTILHADO']
    assert c['dec']['valor'] == c['fec']['valor'] == 0
    assert a['dec']['periodo_referencia'] == PERIODO


def test_regional_pondera_cada_mes_antes_de_somar_a_janela(consultar):
    recife, olinda = consultar()['ranking_regional']['items']
    # Maio: (1*100 + 3*300)/400 = 2,5; junho: (3*200 + 1*100)/300 = 2,3333.
    # Ponderar pelo Cc final produziria 4,0, que é incorreto nesta janela.
    assert recife['municipio'] == 'RECIFE' and recife['bairro'] is None
    assert recife['dec']['valor'] == 4.8333
    assert recife['fec']['valor'] == .7167
    assert recife['dec_sem_dia_critico']['valor'] == 2.5167
    assert recife['fec_sem_dia_critico']['valor'] == .4083
    assert recife['interrupcoes']['valor'] == 250
    assert recife['horas_interrupcao']['valor'] == 1700
    assert olinda['dec']['valor'] == 0


def test_bairros_compartilhados_e_homonimos_nao_mudam_denominadores(consultar):
    dados = consultar(nivel_regional='bairro')
    assert dados['ranking_regional']['nivel_regional'] == 'bairro'
    por_regiao = {(r['municipio'], r['bairro']): r for r in dados['ranking_regional']['items']}
    assert len(por_regiao) == 4
    assert por_regiao['RECIFE', 'COMPARTILHADO']['dec']['valor'] == 4.8333
    assert por_regiao['RECIFE', 'CENTRO']['dec']['valor'] == 4
    assert por_regiao['OLINDA', 'CENTRO']['dec']['valor'] == 0
    assert por_regiao['RECIFE', 'BAIRRO COM, VIRGULA']['horas_interrupcao']['valor'] == 1000
    assert 'não são somáveis' in dados['metadados']['observacoes'][1]


@pytest.mark.parametrize(('ordenar_por', 'ordem'), [
    ('dec', ['ALM-A', 'ALM-B', 'ALM-C']),
    ('fec', ['ALM-A', 'ALM-B', 'ALM-C']),
    ('chi', ['ALM-B', 'ALM-A', 'ALM-C']),
])
def test_ordenacao_decrescente_e_desempate_deterministico(consultar, ordenar_por, ordem):
    ranking = consultar(ordenar_por=ordenar_por)['ranking_alimentadores']['items']
    assert [r['alimentador'] for r in ranking] == ordem
    assert [r['posicao'] for r in ranking] == [1, 2, 3]


def test_rankings_paginam_separadamente_sem_cortar_as_series(consultar):
    dados = consultar(page=3, page_size=1)
    assert dados['ranking_alimentadores']['total'] == 3
    assert dados['ranking_alimentadores']['items'][0]['posicao'] == 3
    assert dados['ranking_regional']['total'] == 2
    assert dados['ranking_regional']['items'] == []
    assert len(dados['serie_historica']) == 3
    assert all(len(s['pontos']) == 2 for s in dados['serie_historica'])
    assert consultar(page=100)['ranking_alimentadores']['items'] == []


def test_ausencia_de_indice_nao_vira_zero_ou_total_parcial(consultar, monkeypatch):
    linhas = meses_exemplo()
    linhas[0]['dec_sem_dia_critico'] = None
    monkeypatch.setattr(service.repo, 'consultar_meses', lambda *args: linhas)
    dados = consultar()
    assert dados['ranking_alimentadores']['items'][0]['dec_sem_dia_critico']['valor'] is None
    assert dados['ranking_regional']['items'][0]['dec_sem_dia_critico']['valor'] is None
    assert dados['serie_historica'][0]['pontos'][0]['dec_sem_dia_critico']['valor'] is None
    assert dados['ranking_regional']['items'][0]['dec']['valor'] == 4.8333


def test_regionais_nao_reconstroem_dec_a_partir_de_chi_arredondado(consultar, monkeypatch):
    # Os índices publicados são mais precisos que a coluna CHI com apenas 2 casas.
    linhas = meses_exemplo()[:1]
    linhas[0].update(ucs_atendidas=3, dec=D('0.3343'), horas_interrupcao=D('1.00'))
    monkeypatch.setattr(service.repo, 'consultar_meses', lambda *args: linhas)
    assert consultar()['ranking_regional']['items'][0]['dec']['valor'] == .3343


def test_consulta_sem_correspondencia_retorna_listas_vazias(consultar, monkeypatch):
    monkeypatch.setattr(service.repo, 'consultar_meses', lambda *args: [])
    dados = consultar()
    assert dados['serie_historica'] == []
    for chave in ('ranking_alimentadores', 'ranking_regional'):
        assert dados[chave]['items'] == [] and dados[chave]['total'] == 0


def test_seed_marca_ausencia_de_expurgo_sem_inventar_indicadores(consultar, monkeypatch):
    monkeypatch.setattr(service, 'GOLD_SOURCE', 'seed')
    linhas = meses_exemplo()
    for linha in linhas:
        linha['dec_sem_dia_critico'] = linha['fec_sem_dia_critico'] = None
    monkeypatch.setattr(service.repo, 'consultar_meses', lambda *args: linhas)
    dados = consultar()
    assert dados['metadados']['dados_ficticios'] is True
    assert 'não possui expurgo' in dados['metadados']['observacoes'][-1]
    assert dados['ranking_alimentadores']['items'][0]['dec_sem_dia_critico']['valor'] is None
