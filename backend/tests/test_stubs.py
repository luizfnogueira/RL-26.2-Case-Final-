"""Stubs do P1 conferidos contra o contrato V2 (docs/api-contract.md) e seus fixtures."""
from fastapi.testclient import TestClient
import pytest

from app.db.session import get_db
from app.main import app
from app.routers import unidades
from app.services.stubs import PERIODO_ATUAL as PA, PERIODO_COMPARACAO as PC, exemplo
from app.services.unidade_service import UnidadeService

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

    def test_periodo_operacional_invalido(self):
        erro(client.get('/operacao', params={'periodo_atual': '2024-13'}), 422, 'DADOS_INVALIDOS')

    def test_bairro_exige_municipio(self):
        erro(client.get('/unidades', params={'bairro': 'Boa Vista'}), 422, 'DADOS_INVALIDOS')


class TestDashboard:
    # Classe não exige pais (ranking consolidado de classes); bairro sem município misturaria homônimos
    @pytest.mark.parametrize('filtros', [{'nivel': 'bairro'}, {'nivel': 'classe', 'bairro': 'Boa Vista'}])
    def test_nivel_exige_filtros_ascendentes(self, filtros):
        erro(client.get('/dashboard', params={**PERIODOS, **filtros}), 422, 'DADOS_INVALIDOS')


class TestUnidades:
    @pytest.fixture(autouse=True)
    def modo_seed(self):
        # Fixa o exemplo do contrato: a suíte passa com GOLD_SOURCE=seed ou real (real: test_unidades_db.py)
        app.dependency_overrides[unidades.get_service] = lambda: UnidadeService(None, fonte='seed')
        yield
        app.dependency_overrides.pop(unidades.get_service, None)

    def test_busca_igual_ao_fixture(self):
        assert get('/unidades', busca='UC-DEMO') == exemplo('unidades')

    def test_busca_por_titular_e_vazia(self):
        assert [u['id_uc'] for u in get('/unidades', busca='comércio')['items']] == ['UC-DEMO-002', 'UC-DEMO-006']
        assert get('/unidades', busca='inexistente')['items'] == []

    @pytest.mark.parametrize('busca', ['UC', '  ab  ', 'x' * 101])
    def test_busca_fora_de_3_a_100_caracteres(self, busca):
        erro(client.get('/unidades', params={'busca': busca}), 422, 'DADOS_INVALIDOS')

    def test_paginacao(self):
        dados = get('/unidades', page=3, page_size=3)
        assert dados['total'] == 8 and len(dados['items']) == 2
        assert get('/unidades', page=9)['items'] == []

    def test_detalhe(self):
        dados = get('/unidades/UC-DEMO-001', periodo_atual=PA)
        assert dados == exemplo('unidade') == get('/unidades/UC-DEMO-001')
        assert len(dados['consumo']) == 12 and dados['cadastro']['telefone'] is None

    def test_detalhe_da_uc_recente(self):
        # Segundo exemplo: meses nulos, sem GD, leitura estimada e nenhuma interrupção.
        dados = get('/unidades/UC-DEMO-007')
        assert dados == exemplo('unidade_recente')
        assert [m['atual']['valor'] is None for m in dados['consumo']] == [True] * 6 + [False] * 6
        assert dados['geracao_distribuida'] is None and dados['interrupcoes_recentes'] == []
        assert dados['total_interrupcoes']['valor'] == 0
        d = dados['diagnostico_conta']
        assert d['conta_alta'] is None and d['meses_media'] == 5 and d['leitura_estimada'] is True

    def test_detalhe_inexistente(self):
        erro(client.get('/unidades/UC-DEMO-002'), 404, 'UC_INEXISTENTE')

    @pytest.mark.parametrize('periodo', ['2026-06', '2026-01/2026-06', '2024-07/2026-06'])
    def test_detalhe_exige_janela_de_12_meses(self, periodo):
        erro(client.get('/unidades/UC-DEMO-001', params={'periodo_atual': periodo}), 422, 'DADOS_INVALIDOS')

    def test_detalhe_outra_janela_de_12_meses_fora_do_stub(self):
        erro(client.get('/unidades/UC-DEMO-001', params={'periodo_atual': '2024-07/2025-06'}), 422,
             'CENARIO_STUB_INDISPONIVEL')


class TestOperacaoValidacao:
    # A leitura real e os rankings estão em test_operacao_service.py/test_operacao_db.py.
    @pytest.mark.parametrize('params', [
        {}, {'periodo_atual': PA, 'classe': 'RESIDENCIAL'},
        {'periodo_atual': PA, 'bairro': 'CENTRO'},
        {'periodo_atual': PA, 'ordenar_por': 'receita'},
        {'periodo_atual': PA, 'nivel_regional': 'classe'},
        {'periodo_atual': PA, 'page': 0}, {'periodo_atual': PA, 'page_size': 101},
        {'periodo_atual': '2026-06/2026-01'},
    ])
    def test_consulta_invalida(self, params):
        erro(client.get('/operacao', params=params), 422, 'DADOS_INVALIDOS')


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
