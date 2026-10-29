"""B5: POST /ia/insight da receita com a ponte real (repository trocado), módulo da Equipe 3 e fallback."""
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.db.session import get_db
from app.main import app
from app.services import insight_service
from app.services.insight_service import (
    PREFIXO_TEXTO_ALTERNATIVO, GeradorMock, GeradorReal, obter_gerador_insight,
)
from app.services.stubs import PERIODO_ATUAL as PA, PERIODO_COMPARACAO as PC, exemplo

client = TestClient(app)
NOMES = ['receita_energia_atual', 'receita_energia_comparacao', 'variacao_volume', 'reajuste',
         'efeito_preco', 'efeito_volume']

# Dois recortes da decomposição, como a Gold os entrega (preço + volume fecham a variação sem resíduo)
LINHAS = [
    SimpleNamespace(receita_energia_p1=Decimal('100000000.00'), receita_energia_p2=Decimal('110000000.00'),
                    efeito_preco=Decimal('14000000.00'), efeito_volume=Decimal('-4000000.00'),
                    kwh_p1=Decimal('200000000'), kwh_p2=Decimal('192000000')),
    SimpleNamespace(receita_energia_p1=Decimal('50000000.00'), receita_energia_p2=Decimal('52000000.00'),
                    efeito_preco=Decimal('3000000.00'), efeito_volume=Decimal('-1000000.00'),
                    kwh_p1=Decimal('100000000'), kwh_p2=Decimal('98000000')),
]
ENERGIA = {PA: Decimal('290000000'), PC: Decimal('300000000')}


@pytest.fixture(autouse=True)
def gold_falsa(monkeypatch):
    """Sem banco: o repository devolve a decomposição e a energia de cada janela."""
    app.dependency_overrides[get_db] = lambda: None
    monkeypatch.setattr(insight_service, 'metadados_gold', lambda db, tabela, obs: {
        'dados_ficticios': True, 'gold_atualizada_em': None, 'observacoes': [obs]})
    chamadas = {'regiao': None}

    def linhas(db, regiao):
        chamadas['regiao'] = regiao
        return LINHAS

    monkeypatch.setattr(insight_service.dashboard_repository, 'linhas_preco_volume', linhas)
    monkeypatch.setattr(insight_service.dashboard_repository, 'somar_energia',
                        lambda db, inicio, fim, regiao: ENERGIA[PA if inicio == '2025-07' else PC])
    yield chamadas
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(obter_gerador_insight, None)


class GeradorFixo:
    def __init__(self, resposta=None, erro=None):
        self.resposta, self.erro, self.pedidos = resposta, erro, []

    def gerar(self, pedido):
        self.pedidos.append(pedido)
        if self.erro:
            raise self.erro
        return self.resposta


def usar(gerador):
    app.dependency_overrides[obter_gerador_insight] = lambda: gerador
    return gerador


def pedir(**mudancas):
    pedido = {**exemplo('pedido_insight'), 'indicadores': [], **mudancas}
    return client.post('/ia/insight', json=pedido)


def erro(response, status, codigo):
    assert response.status_code == status, response.text
    assert response.json()['codigo'] == codigo


def numeros_da(response):
    return {n['nome']: n for n in response.json()['numeros_utilizados']}


class TestNumerosDaPonteReal:
    def test_seis_numeros_vem_da_gold_e_a_ponte_fecha(self):
        response = pedir()
        assert response.status_code == 200, response.text
        assert [n['nome'] for n in response.json()['numeros_utilizados']] == NOMES
        n = numeros_da(response)
        assert n['receita_energia_comparacao']['valor'] == 150_000_000
        assert n['receita_energia_atual']['valor'] == 162_000_000
        assert n['efeito_preco']['valor'] == 17_000_000
        assert n['efeito_volume']['valor'] == -5_000_000
        assert (n['receita_energia_comparacao']['valor'] + n['efeito_preco']['valor']
                + n['efeito_volume']['valor']) == n['receita_energia_atual']['valor']

    def test_variacao_do_volume_e_reajuste_vem_dos_mesmos_calculos_do_dashboard(self):
        n = numeros_da(pedir())
        assert n['variacao_volume']['valor'] == pytest.approx(-3.3333, abs=1e-4)
        assert n['variacao_volume']['unidade'] == '%' and n['variacao_volume']['periodo_referencia'] == PA
        # tarifa = receita ÷ kWh de todo o conjunto (não a soma das tarifas dos recortes)
        esperado = (162_000_000 / 290_000_000) / (150_000_000 / 300_000_000) * 100 - 100
        assert n['reajuste']['valor'] == pytest.approx(esperado, abs=1e-3)

    def test_recorte_vai_para_a_consulta_com_o_nome_como_esta_no_banco(self, gold_falsa):
        filtros = {**exemplo('pedido_insight')['filtros'], 'municipio': 'RECIFE', 'bairro': 'BOA VISTA'}
        response = pedir(filtros=filtros)
        assert response.status_code == 200
        assert gold_falsa['regiao'] == {'municipio': 'RECIFE', 'bairro': 'BOA VISTA', 'classe': None}
        # No texto os nomes ficam legíveis; na consulta valem como estão no banco
        assert response.json()['texto'].startswith('Em Recife / Boa Vista')

    def test_nomes_em_maiusculas_ficam_legiveis_no_texto(self):
        assert insight_service._nome('JABOATÃO DOS GUARARAPES') == 'Jaboatão dos Guararapes'
        assert insight_service._nome('Recife') == 'Recife'

    def test_indicadores_enviados_que_batem_sao_aceitos(self):
        enviados = pedir().json()['numeros_utilizados']
        assert pedir(indicadores=enviados).status_code == 200

    def test_indicador_que_nao_bate_com_a_gold_e_422(self):
        enviados = pedir().json()['numeros_utilizados']
        enviados[0]['valor'] += 1000
        erro(pedir(indicadores=enviados), 422, 'DADOS_INVALIDOS')
        # O fixture do contrato é um cenário do stub: contra a Gold real eles não batem.
        erro(pedir(indicadores=exemplo('pedido_insight')['indicadores']), 422, 'DADOS_INVALIDOS')

    def test_fora_de_p1_x_p2_ou_com_alimentador_nao_ha_ponte(self):
        base = exemplo('pedido_insight')['filtros']
        erro(pedir(filtros={**base, 'periodo_atual': '2024-07/2025-06'}), 422, 'DECOMPOSICAO_INDISPONIVEL')
        erro(pedir(filtros={**base, 'alimentador': 'ALM-001'}), 422, 'DECOMPOSICAO_INDISPONIVEL')

    def test_recorte_sem_linhas_na_gold_e_422_e_nunca_zero(self, monkeypatch):
        monkeypatch.setattr(insight_service.dashboard_repository, 'linhas_preco_volume', lambda db, regiao: [])
        erro(pedir(), 422, 'DECOMPOSICAO_INDISPONIVEL')


class TestModuloDaEquipe3:
    def test_modo_mock_e_o_padrao_e_gera_o_texto_por_regra(self):
        assert config.IA_MODO == 'mock'
        assert isinstance(obter_gerador_insight(), GeradorMock)
        dados = pedir().json()
        assert dados['titulo'] == 'Por que a receita mudou?'
        assert 'efeito-preço' in dados['texto'] and 'No consolidado' in dados['texto']
        assert 'O crescimento da receita veio do preço' in dados['texto']
        assert not any(o.startswith(PREFIXO_TEXTO_ALTERNATIVO) for o in dados['metadados']['observacoes'])

    def test_modo_real_escolhe_o_gerador_real(self, monkeypatch):
        monkeypatch.setattr(config, 'IA_MODO', 'real')
        assert isinstance(obter_gerador_insight(), GeradorReal)

    def test_texto_do_modulo_e_usado_e_os_numeros_continuam_os_da_gold(self):
        gerador = usar(GeradorFixo({'titulo': 'Preço sustentou', 'texto': 'O reajuste explica o avanço.',
                                    'numeros_utilizados': [{'nome': 'inventado', 'valor': 1}]}))
        dados = pedir().json()
        assert (dados['titulo'], dados['texto']) == ('Preço sustentou', 'O reajuste explica o avanço.')
        assert [n['nome'] for n in dados['numeros_utilizados']] == NOMES   # o módulo nunca dita os números
        assert not any(o.startswith(PREFIXO_TEXTO_ALTERNATIVO) for o in dados['metadados']['observacoes'])
        assert [n['nome'] for n in gerador.pedidos[0]['numeros_utilizados']] == NOMES

    @pytest.mark.parametrize('falha', [
        {'erro': httpx.ReadTimeout('lento demais')},
        {'erro': httpx.ConnectError('fora do ar')},
        {'erro': httpx.HTTPStatusError('502', request=httpx.Request('POST', 'http://x'),
                                       response=httpx.Response(502))},
        {'erro': ValueError('json inválido')},
        {'resposta': {'titulo': 'só título'}},
        {'resposta': {'titulo': 'x', 'texto': ''}},
        {'resposta': 'não é um objeto'},
    ])
    def test_falha_do_modulo_vira_texto_alternativo_e_nunca_503(self, falha):
        usar(GeradorFixo(**falha))
        response = pedir()
        assert response.status_code == 200, response.text
        dados = response.json()
        assert 'No consolidado' in dados['texto']
        assert any(o.startswith(PREFIXO_TEXTO_ALTERNATIVO) for o in dados['metadados']['observacoes'])
        assert [n['nome'] for n in dados['numeros_utilizados']] == NOMES

    def test_modo_real_sem_endereco_cai_no_texto_alternativo(self):
        usar(GeradorReal(url='', chave='segredo'))
        dados = pedir().json()
        assert any(o.startswith(PREFIXO_TEXTO_ALTERNATIVO) for o in dados['metadados']['observacoes'])


class TestGeradorReal:
    PEDIDO_NUMEROS = [{'nome': 'efeito_preco', 'rotulo': 'Efeito-preço', 'valor': Decimal('17000000'),
                       'unidade': 'BRL', 'periodo_referencia': PA}]

    def gerador(self, handler, **extra):
        cliente = httpx.Client(transport=httpx.MockTransport(handler))
        return GeradorReal(url='http://equipe3.test/insight', chave='segredo', timeout_s=7, cliente=cliente, **extra)

    def pedido(self):
        from app.schemas.dashboard import FiltrosDashboard
        return {'filtros': FiltrosDashboard(periodo_atual=PA, periodo_comparacao=PC),
                'numeros_utilizados': self.PEDIDO_NUMEROS}

    def test_envia_o_recorte_e_os_numeros_com_a_chave_no_header(self):
        vistos = {}

        def handler(request):
            vistos['url'], vistos['auth'] = str(request.url), request.headers.get('authorization')
            vistos['corpo'] = request.read().decode()
            return httpx.Response(200, json={'titulo': 'T', 'texto': 'X'})

        resposta = self.gerador(handler).gerar(self.pedido())
        assert resposta == {'titulo': 'T', 'texto': 'X'}
        assert vistos['url'] == 'http://equipe3.test/insight'
        assert vistos['auth'] == 'Bearer segredo'
        assert '"efeito_preco"' in vistos['corpo'] and '"periodo_comparacao":"2022-07/2023-06"' in vistos['corpo'].replace(' ', '')
        assert 'segredo' not in vistos['corpo']

    def test_usa_o_timeout_configurado(self):
        gerador = GeradorReal(url='http://x', chave='', timeout_s=7)
        assert gerador.timeout_s == 7
        assert GeradorReal().timeout_s == config.IA_TIMEOUT_S

    def test_erro_http_do_modulo_propaga_para_o_fallback(self):
        with pytest.raises(httpx.HTTPStatusError):
            self.gerador(lambda request: httpx.Response(500)).gerar(self.pedido())

    def test_a_chave_nunca_aparece_na_resposta_da_api(self):
        usar(GeradorReal(url='', chave='segredo-da-equipe-3'))
        assert 'segredo-da-equipe-3' not in pedir().text
