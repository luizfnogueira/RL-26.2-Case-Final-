"""C1: GET /dashboard/comparacao — validação, cálculo por UC e conferência contra o GET /dashboard.

Os testes de banco só rodam com TEST_DATABASE_URL apontando para um PostgreSQL descartável.
"""
import os
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import seed
from app.db.session import get_db
from app.main import app
from app.models.gold import UnidadeConsumidora
from app.schemas.dashboard import Comparacao, FiltrosComparacao
from app.services import comparacao_service
from app.services.dashboard_service import kpi
from app.services.stubs import PERIODO_ATUAL as PA, PERIODO_COMPARACAO as PC, exemplo, indicador

PERIODOS = {'periodo_atual': PA, 'periodo_comparacao': PC}
URL_TESTE = os.getenv('TEST_DATABASE_URL')


def test_exemplo_do_contrato_segue_o_schema():
    Comparacao.model_validate(exemplo('comparacao'))


class TestValidacao:
    @pytest.fixture(autouse=True)
    def sem_banco(self):
        app.dependency_overrides[get_db] = lambda: None
        yield
        app.dependency_overrides.pop(get_db, None)

    @pytest.mark.parametrize('params', [
        {'nivel': 'municipio', 'itens': ['RECIFE']},                                   # menos de 2
        {'nivel': 'municipio', 'itens': ['A', 'B', 'C', 'D', 'E']},                    # mais de 4
        {'nivel': 'municipio', 'itens': ['RECIFE', 'RECIFE']},                         # repetido
        {'nivel': 'municipio', 'itens': ['RECIFE', 'OLINDA'], 'municipio': 'RECIFE'},  # pai no nível de cima
        {'nivel': 'bairro', 'itens': ['BOA VIAGEM', 'BOA VISTA']},                     # bairro sem município
        {'nivel': 'bairro', 'itens': ['A', 'B'], 'municipio': 'RECIFE', 'bairro': 'C'},
        {'nivel': 'classe', 'itens': ['RESIDENCIAL', 'RURAL'], 'bairro': 'BOA VIAGEM'},  # bairro sem município
        {'nivel': 'municipio', 'itens': ['RECIFE', 'OLINDA'], 'classe': 'RURAL'},
        {'nivel': 'municipio', 'itens': ['RECIFE', 'OLINDA'], 'alimentador': 'ALM-REC-001'},
        {'nivel': 'regional', 'itens': ['RECIFE', 'OLINDA']},
        {'itens': ['RECIFE', 'OLINDA']},                                               # sem nível
    ])
    def test_pedido_invalido_e_422(self, params):
        response = TestClient(app).get('/dashboard/comparacao', params={**PERIODOS, **params})
        assert response.status_code == 422, response.text
        assert response.json()['codigo'] == 'DADOS_INVALIDOS'

    def test_periodos_seguem_a_regra_do_dashboard(self):
        response = TestClient(app).get('/dashboard/comparacao', params={
            'periodo_atual': PA, 'periodo_comparacao': '2022-07/2022-12', 'nivel': 'municipio',
            'itens': ['RECIFE', 'OLINDA']})
        assert response.status_code == 422


def indicadores_falsos(receita, energia, ucs, aberto=(Decimal(10), Decimal(5)), dec=(Decimal('1.5'), Decimal(1))):
    pct = [None if r in (None, 0) or a is None else round(a / r * 100, 4) for a, r in zip(aberto, receita)]
    return {
        'receita_faturada': kpi('Receita faturada', *receita, 'BRL', PA, PC),
        'energia_faturada': kpi('Volume faturado', *energia, 'kWh', PA, PC),
        'ucs_ativas': kpi('UCs ativas', *ucs, 'UCs', PA, PC),
        'inadimplencia': {**kpi('Valor em aberto', *aberto, 'BRL', PA, PC),
                          'percentual_receita_atual': indicador(pct[0], '%', PA),
                          'percentual_receita_comparacao': indicador(pct[1], '%', PC),
                          'variacao_pontos_percentuais': indicador(
                              None if None in pct else round(pct[0] - pct[1], 4), 'p.p.', PA)},
        'dec_medio': kpi('DEC médio', *dec, 'h/UC', PA, PC),
        'fec_medio': kpi('FEC médio', *dec, 'interrupcoes/UC', PA, PC),
    }


class TestCalculo:
    def test_item_vira_o_filtro_do_seu_nivel_com_os_filtros_pai(self):
        f = FiltrosComparacao(**PERIODOS, nivel='classe', municipio='RECIFE', bairro='BOA VISTA',
                              itens=['RESIDENCIAL', 'COMERCIAL'])
        recorte = comparacao_service.filtros_do_item(f, 'RESIDENCIAL')
        assert (recorte.municipio, recorte.bairro, recorte.classe) == ('RECIFE', 'BOA VISTA', 'RESIDENCIAL')
        f = FiltrosComparacao(**PERIODOS, nivel='municipio', itens=['RECIFE', 'OLINDA'])
        recorte = comparacao_service.filtros_do_item(f, 'OLINDA')
        assert (recorte.municipio, recorte.bairro, recorte.classe) == ('OLINDA', None, None)

    def test_medias_por_uc_por_mes_e_percentual_em_aberto(self):
        f = FiltrosComparacao(**PERIODOS, nivel='municipio', itens=['RECIFE', 'OLINDA'])
        item = comparacao_service.montar_item(
            indicadores_falsos((Decimal(12000), Decimal(6000)), (Decimal(24000), Decimal(24000)), (10, 5)),
            'RECIFE', f)
        assert item['receita_media_uc']['atual']['valor'] == Decimal(100)        # 12000 / 10 UCs / 12 meses
        assert item['receita_media_uc']['comparacao']['valor'] == Decimal(100)   # 6000 / 5 / 12
        assert item['receita_media_uc']['variacao_percentual']['valor'] == 0
        assert item['consumo_medio_uc']['atual']['valor'] == Decimal(200)
        assert item['consumo_medio_uc']['atual']['unidade'] == 'kWh/UC/mes'
        assert item['valor_em_aberto_pct']['diferenca']['unidade'] == 'p.p.'
        assert item['dec']['atual']['valor'] == Decimal('1.5')

    def test_sem_ucs_a_media_e_ausente_nunca_zero(self):
        f = FiltrosComparacao(**PERIODOS, nivel='municipio', itens=['RECIFE', 'OLINDA'])
        item = comparacao_service.montar_item(
            indicadores_falsos((None, None), (None, None), (0, 0), aberto=(None, None), dec=(None, None)),
            'NAO EXISTE', f)
        for campo in ('receita_media_uc', 'consumo_medio_uc', 'valor_em_aberto_pct', 'dec', 'fec'):
            assert item[campo]['atual']['valor'] is None, campo
        assert item['ucs_ativas']['atual']['valor'] == 0

    def test_item_inexistente_nao_derruba_os_outros(self, monkeypatch):
        def falso(db, recorte):
            if recorte.municipio == 'NAO EXISTE':
                return indicadores_falsos((None, None), (None, None), (0, 0), aberto=(None, None), dec=(None, None))
            return indicadores_falsos((Decimal(1200), Decimal(1200)), (Decimal(10), Decimal(10)), (1, 1))
        monkeypatch.setattr(comparacao_service, 'montar_indicadores', falso)
        # Sem banco: a proveniência é a do seed, também com GOLD_SOURCE=real no .env
        monkeypatch.setattr(comparacao_service, 'metadados_gold', lambda db, tabela, obs: {
            'dados_ficticios': True, 'gold_atualizada_em': None, 'observacoes': [obs]})
        f = FiltrosComparacao(**PERIODOS, nivel='municipio', itens=['RECIFE', 'NAO EXISTE', 'OLINDA'])
        resposta = comparacao_service.montar_comparacao(None, f)
        Comparacao.model_validate(resposta)
        assert [i['nome'] for i in resposta['itens']] == ['RECIFE', 'NAO EXISTE', 'OLINDA']
        assert resposta['itens'][0]['receita_media_uc']['atual']['valor'] == Decimal(100)
        assert any('NAO EXISTE' in o for o in resposta['metadados']['observacoes'])


DADOS = seed.gerar(n_ucs=40, semente=9)


@pytest.fixture(scope='module')
def client():
    engine = create_engine(URL_TESTE, pool_pre_ping=True)
    seed.recarregar_gold(engine, DADOS)

    def override_get_db():
        db = Session(bind=engine)
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


@pytest.mark.skipif(not URL_TESTE, reason='defina TEST_DATABASE_URL para testar contra o PostgreSQL')
class TestContraODashboard:
    def comparar(self, client, nivel, itens, **pais):
        comparacao = client.get('/dashboard/comparacao',
                                params={**PERIODOS, 'nivel': nivel, 'itens': itens, **pais})
        assert comparacao.status_code == 200, comparacao.text
        for item in comparacao.json()['itens']:
            painel = client.get('/dashboard', params={**PERIODOS, **pais, nivel: item['nome']}).json()['indicadores']
            assert item['ucs_ativas'] == painel['ucs_ativas']
            assert item['dec'] == painel['dec_medio'] and item['fec'] == painel['fec_medio']
            ucs = painel['ucs_ativas']['atual']['valor']
            receita = painel['receita_faturada']['atual']['valor']
            assert item['receita_media_uc']['atual']['valor'] == pytest.approx(receita / ucs / 12, abs=0.01)
            assert (item['valor_em_aberto_pct']['atual']['valor']
                    == painel['inadimplencia']['percentual_receita_atual']['valor'])
        return comparacao.json()

    def test_municipios_batem_com_o_painel_filtrado(self, client):
        municipios = sorted({u['municipio'] for u in DADOS[UnidadeConsumidora]})[:3]
        resposta = self.comparar(client, 'municipio', municipios)
        assert [i['nome'] for i in resposta['itens']] == municipios
        assert resposta['metadados']['dados_ficticios'] is True

    def test_bairros_e_classes_batem_com_o_painel_filtrado(self, client):
        uc = DADOS[UnidadeConsumidora][0]
        bairros = sorted({u['bairro'] for u in DADOS[UnidadeConsumidora] if u['municipio'] == uc['municipio']})
        if len(bairros) >= 2:
            resposta = self.comparar(client, 'bairro', bairros[:2], municipio=uc['municipio'])
            assert all(i['dec']['atual']['valor'] is None for i in resposta['itens'])
        classes = sorted({u['classe'] for u in DADOS[UnidadeConsumidora]})[:2]
        self.comparar(client, 'classe', classes)

    def test_item_fora_do_cadastro_vem_vazio(self, client):
        municipio = DADOS[UnidadeConsumidora][0]['municipio']
        resposta = client.get('/dashboard/comparacao', params={
            **PERIODOS, 'nivel': 'municipio', 'itens': [municipio, 'NAO EXISTE']}).json()
        vazio = resposta['itens'][1]
        assert vazio['ucs_ativas']['atual']['valor'] == 0
        assert vazio['receita_media_uc']['atual']['valor'] is None
        assert resposta['itens'][0]['receita_media_uc']['atual']['valor'] is not None
