"""Stubs do P1 conferidos contra o contrato V2 (docs/api-contract.md) e seus fixtures."""
from fastapi.testclient import TestClient
import pytest

from app.db.session import get_db
from app.main import app
from app.services.stubs import PERIODO_ATUAL as PA, PERIODO_COMPARACAO as PC, exemplo

client = TestClient(app)
PERIODOS = {'periodo_atual': PA, 'periodo_comparacao': PC}


@pytest.fixture(autouse=True)
def sem_banco():
    # GET /dashboard lê o banco e é testado em test_dashboard.py; aqui só a validação de entrada
    app.dependency_overrides[get_db] = lambda: None
    yield
    app.dependency_overrides.pop(get_db, None)


def get(url: str, **params) -> dict:
    response = client.get(url, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def erro(response, status: int, codigo: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()['codigo'] == codigo


class TestPeriodos:
    @pytest.mark.parametrize('params', [
        {'periodo_atual': '2025-13/2026-06', 'periodo_comparacao': PC},
        {'periodo_atual': '2026-06/2025-07', 'periodo_comparacao': PC},
        {'periodo_atual': PA, 'periodo_comparacao': PA},
        {'periodo_atual': PA, 'periodo_comparacao': '2022-07/2022-12'},
        {'periodo_atual': PA},
    ])
    def test_periodo_invalido_retorna_422(self, params):
        erro(client.get('/dashboard', params=params), 422, 'DADOS_INVALIDOS')

    def test_periodo_valido_fora_do_cenario(self):
        erro(client.get('/operacao', params={'periodo_atual': '2024-07/2025-06'}), 422, 'CENARIO_STUB_INDISPONIVEL')

    def test_bairro_exige_municipio(self):
        erro(client.get('/unidades', params={'bairro': 'Boa Vista'}), 422, 'DADOS_INVALIDOS')


class TestDashboard:
    @pytest.mark.parametrize('filtros', [{'nivel': 'bairro'}, {'nivel': 'classe', 'municipio': 'Recife'}])
    def test_nivel_exige_filtros_ascendentes(self, filtros):
        erro(client.get('/dashboard', params={**PERIODOS, **filtros}), 422, 'DADOS_INVALIDOS')


class TestUnidades:
    def test_busca_igual_ao_fixture(self):
        assert get('/unidades', busca='UC-DEMO') == exemplo('unidades')

    def test_busca_por_titular_e_vazia(self):
        assert [u['id_uc'] for u in get('/unidades', busca='comércio')['items']] == ['UC-DEMO-002', 'UC-DEMO-006']
        assert get('/unidades', busca='inexistente')['items'] == []

    def test_paginacao(self):
        dados = get('/unidades', page=3, page_size=3)
        assert dados['total'] == 8 and len(dados['items']) == 2
        assert get('/unidades', page=9)['items'] == []

    def test_detalhe(self):
        dados = get('/unidades/UC-DEMO-001', periodo_atual=PA)
        assert dados == exemplo('unidade') == get('/unidades/UC-DEMO-001')
        assert len(dados['consumo']) == 12 and dados['cadastro']['telefone'] is None

    def test_detalhe_inexistente(self):
        erro(client.get('/unidades/UC-DEMO-002'), 404, 'UC_INEXISTENTE')
        erro(client.get('/unidades/UC-DEMO-001', params={'periodo_atual': '2026-06'}), 422,
             'CENARIO_STUB_INDISPONIVEL')


class TestOperacao:
    def test_igual_ao_fixture(self):
        assert get('/operacao', periodo_atual=PA) == exemplo('operacao')

    def test_series_somam_rankings(self):
        dados = get('/operacao', periodo_atual=PA)
        series = {s['alimentador']: s['pontos'] for s in dados['serie_historica']}
        for item in dados['ranking_alimentadores']['items']:
            pontos = series[item['alimentador']]
            assert len(pontos) == 12
            assert sum(p['dec']['valor'] for p in pontos) == pytest.approx(item['dec']['valor'])

    def test_ordenacao_e_paginacao_independentes(self):
        dados = get('/operacao', periodo_atual=PA, ordenar_por='fec', nivel_regional='bairro', page_size=2)
        fec = [a['fec']['valor'] for a in dados['ranking_alimentadores']['items']]
        assert fec == sorted(fec, reverse=True) and dados['ranking_alimentadores']['total'] == 5
        assert dados['ranking_regional']['total'] == 7 and len(dados['ranking_regional']['items']) == 2
        assert len(dados['serie_historica']) == 5

    def test_filtro_bairro_e_alimentador(self):
        dados = get('/operacao', periodo_atual=PA, municipio='Olinda', bairro='Rio Doce', nivel_regional='bairro')
        assert [a['alimentador'] for a in dados['ranking_alimentadores']['items']] == ['ALM-DEMO-005']
        assert [r['bairro'] for r in dados['ranking_regional']['items']] == ['Rio Doce']
        dados = get('/operacao', periodo_atual=PA, alimentador='ALM-DEMO-001')
        assert [s['alimentador'] for s in dados['serie_historica']] == ['ALM-DEMO-001']

    def test_sem_dia_critico_e_ranking_por_chi(self):
        dados = get('/operacao', periodo_atual=PA, ordenar_por='chi')
        alimentadores = dados['ranking_alimentadores']['items']
        horas = [a['horas_interrupcao']['valor'] for a in alimentadores]
        assert horas == sorted(horas, reverse=True)
        for a in alimentadores:
            assert a['dec_sem_dia_critico']['valor'] <= a['dec']['valor']
            assert a['fec_sem_dia_critico']['valor'] <= a['fec']['valor']

    def test_classe_retorna_erro(self):
        erro(client.get('/operacao', params={'periodo_atual': PA, 'classe': 'Residencial'}), 422,
             'CENARIO_STUB_INDISPONIVEL')


class TestIA:
    def test_ok(self):
        response = client.post('/ia', json=exemplo('pergunta_ia'))
        assert response.json() == exemplo('resposta_ia')
        dados = response.json()['dados']
        assert all(len(linha) == len(dados['colunas']) for linha in dados['linhas'])

    @pytest.mark.parametrize('pergunta, status', [
        ('Qual a previsão de lucro em 2030?', 'nao_sei'),
        ('DROP TABLE clientes', 'bloqueado'),
    ])
    def test_cenarios(self, pergunta, status):
        response = client.post('/ia', json={'pergunta': pergunta})
        assert response.status_code == 200 and response.json()['status'] == status
        assert response.json()['sql'] is None

    def test_pergunta_vazia(self):
        erro(client.post('/ia', json={'pergunta': '  '}), 422, 'DADOS_INVALIDOS')


class TestInsight:
    # O insight da receita lê a ponte real (banco) desde a B5: ver tests/test_insight.py.
    # Aqui ficam o resumo da unidade (ainda stub) e a validação de entrada.

    def test_unidade(self):
        response = client.post('/ia/insight', json=exemplo('pedido_insight_unidade'))
        assert response.json() == exemplo('resposta_insight_unidade')
        assert len(response.json()['numeros_utilizados']) == 4

    def test_unidade_inexistente(self):
        pedido = {**exemplo('pedido_insight_unidade'), 'id_uc': 'UC-DEMO-002'}
        erro(client.post('/ia/insight', json=pedido), 404, 'UC_INEXISTENTE')

    def test_combinacoes_invalidas(self):
        pedido = {**exemplo('pedido_insight_unidade'), 'id_uc': None}
        erro(client.post('/ia/insight', json=pedido), 422, 'DADOS_INVALIDOS')
        pedido = {**exemplo('pedido_insight'), 'id_uc': 'UC-DEMO-001'}
        erro(client.post('/ia/insight', json=pedido), 422, 'DADOS_INVALIDOS')


def test_openapi_gera_todas_as_rotas():
    caminhos = client.get('/openapi.json').json()['paths']
    assert {'/dashboard', '/unidades', '/unidades/{id}', '/inspecoes/candidatos', '/inspecoes',
            '/inspecoes/{id}', '/operacao', '/ia', '/ia/insight', '/health'} <= caminhos.keys()
