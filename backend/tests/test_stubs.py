"""Stubs do P1 conferidos contra o contrato V2 (docs/api-contract.md) e seus fixtures."""
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.services.stubs import PERIODO_ATUAL as PA, PERIODO_COMPARACAO as PC, exemplo

client = TestClient(app)
PERIODOS = {'periodo_atual': PA, 'periodo_comparacao': PC}


def get(url: str, **params) -> dict:
    response = client.get(url, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def erro(response, status: int, codigo: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()['codigo'] == codigo


def soma_ponte(ponte: dict) -> float:
    return sum(ponte[c]['valor'] for c in ('receita_comparacao', 'efeito_preco', 'efeito_volume', 'bandeira_mix'))


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
        params = {'periodo_atual': '2024-07/2025-06', 'periodo_comparacao': PC}
        erro(client.get('/dashboard', params=params), 422, 'CENARIO_STUB_INDISPONIVEL')

    def test_bairro_exige_municipio(self):
        erro(client.get('/unidades', params={'bairro': 'Boa Vista'}), 422, 'DADOS_INVALIDOS')


class TestDashboard:
    def test_consolidado_igual_ao_fixture(self):
        assert get('/dashboard', **PERIODOS) == exemplo('dashboard')

    def test_estrutura_do_consolidado(self):
        dados = get('/dashboard', **PERIODOS)
        assert set(dados['indicadores']) == {'receita_faturada', 'energia_faturada', 'ucs_ativas',
                                             'inadimplencia', 'dec_medio', 'fec_medio'}
        serie = dados['serie_historica']
        assert len(serie) == 48 and serie[0]['mes'] == '2022-07' and serie[-1]['mes'] == '2026-06'
        ponte = dados['ponte_receita']
        assert soma_ponte(ponte) == pytest.approx(ponte['receita_atual']['valor'])
        assert ponte['receita_atual']['valor'] == 284_700_000
        anual = sum(p['receita']['valor'] for p in serie[-12:])
        assert anual == pytest.approx(dados['indicadores']['receita_faturada']['atual']['valor'])

    @pytest.mark.parametrize('filtros', [
        {'nivel': 'bairro', 'municipio': 'Recife'},
        {'nivel': 'classe', 'municipio': 'Recife', 'bairro': 'Boa Vista'},
        {'classe': 'Comercial'},
        {'alimentador': 'ALM-DEMO-004'},
    ])
    def test_recortes_mantem_somas(self, filtros):
        dados = get('/dashboard', **PERIODOS, **filtros)
        ponte, drill = dados['ponte_receita'], dados['drill_down']
        assert soma_ponte(ponte) == pytest.approx(ponte['receita_atual']['valor'])
        assert sum(l['receita_atual']['valor'] for l in drill['items']) == pytest.approx(ponte['receita_atual']['valor'])
        assert sum(l['efeito_volume']['valor'] for l in drill['items']) == pytest.approx(
            ponte['efeito_volume']['valor'], abs=0.05)
        assert dados['indicadores']['dec_medio']['atual']['valor'] is None
        assert dados['indicadores']['dec_medio']['meta']['valor'] is not None

    def test_drill_ordenado_e_com_breadcrumb(self):
        drill = get('/dashboard', **PERIODOS, nivel='classe', municipio='Recife', bairro='Boa Vista')['drill_down']
        quedas = [l['queda_kwh']['valor'] for l in drill['items']]
        assert quedas == sorted(quedas, reverse=True)
        assert [b['nivel'] for b in drill['breadcrumb']] == ['consolidado', 'municipio', 'bairro']
        assert drill['items'][0]['filtros']['bairro'] == 'Boa Vista'

    @pytest.mark.parametrize('filtros', [{'nivel': 'bairro'}, {'nivel': 'classe', 'municipio': 'Recife'}])
    def test_nivel_exige_filtros_ascendentes(self, filtros):
        erro(client.get('/dashboard', params={**PERIODOS, **filtros}), 422, 'DADOS_INVALIDOS')

    def test_recorte_inexistente(self):
        erro(client.get('/dashboard', params={**PERIODOS, 'municipio': 'Caruaru'}), 422, 'CENARIO_STUB_INDISPONIVEL')


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


class TestCandidatos:
    def test_igual_ao_fixture(self):
        assert get('/inspecoes/candidatos', periodo_atual=PA) == exemplo('candidatos')

    def test_ordem_e_ordens_ativas(self):
        dados = get('/inspecoes/candidatos', periodo_atual=PA)
        scores = [c['score'] for c in dados['items']]
        assert scores == sorted(scores, reverse=True)
        ativas = {c['id_uc']: c['id_ordem_ativa'] for c in dados['items'] if c['ordem_ativa']}
        assert ativas == {'UC-DEMO-002': 1, 'UC-DEMO-005': 2}

    def test_posicao_global_apos_filtros(self):
        dados = get('/inspecoes/candidatos', periodo_atual=PA, municipio='Olinda', page_size=1, page=2)
        assert dados['total'] == 2 and dados['items'][0]['posicao'] == 2
        assert dados['resumo']['ucs_analisadas']['valor'] == 2


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
        ('Qual foi a receita no período?', 'nao_sei'),
    ])
    def test_cenarios(self, pergunta, status):
        response = client.post('/ia', json={'pergunta': pergunta})
        assert response.status_code == 200 and response.json()['status'] == status
        assert response.json()['sql'] is None

    def test_pergunta_vazia(self):
        erro(client.post('/ia', json={'pergunta': '  '}), 422, 'DADOS_INVALIDOS')


class TestInsight:
    def test_receita_igual_ao_fixture(self):
        response = client.post('/ia/insight', json=exemplo('pedido_insight'))
        assert response.json() == exemplo('resposta_insight')
        assert len(response.json()['numeros_utilizados']) == 6

    def test_receita_sem_indicadores_e_com_recorte(self):
        pedido = {**exemplo('pedido_insight'), 'indicadores': []}
        assert client.post('/ia/insight', json=pedido).json() == exemplo('resposta_insight')
        pedido['filtros'] = {**pedido['filtros'], 'municipio': 'Recife'}
        dados = client.post('/ia/insight', json=pedido).json()
        assert dados['texto'].startswith('Em Recife')
        dashboard = get('/dashboard', **PERIODOS, municipio='Recife')
        assert dados['numeros_utilizados'][0]['valor'] == dashboard['ponte_receita']['receita_atual']['valor']

    def test_receita_com_indicador_divergente(self):
        pedido = exemplo('pedido_insight')
        pedido['indicadores'][0]['valor'] = 1
        erro(client.post('/ia/insight', json=pedido), 422, 'DADOS_INVALIDOS')

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
