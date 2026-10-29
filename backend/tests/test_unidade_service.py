"""V1a: UnidadeService sem banco (repository substituído); a resposta é validada pelo schema do contrato."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from fastapi.testclient import TestClient

from app.core.exceptions import CenarioStubIndisponivelException, GoldNaoCarregadaException, UCInexistenteException
from app.main import app
from app.routers import unidades
from app.repositories.unidade_repository import (
    CadastroUC, ChamadoUC, FaturaUC, FichaUC, GeracaoDistribuidaUC, InterrupcaoUC, LeituraUC, MedidorUC,
    MesConsumo, UnidadeResumo,
)
from app.schemas.unidades import FiltroUnidade, FiltrosUnidades, Unidade360, Unidades
from app.services.stubs import exemplo
from app.services.unidade_service import UnidadeService, hora_local, janela_padrao, somar_meses

UTC = timezone.utc
METADADOS = {'dados_ficticios': False, 'gold_atualizada_em': '2026-10-25T00:00:00Z', 'observacoes': ['real']}
RESUMO = UnidadeResumo('UC-1', 'TITULAR 1', 'RECIFE', 'BOA VISTA', 'RESIDENCIAL', 'ALM-1', 'ATIVA')
CADASTRO = CadastroUC(*vars(RESUMO).values(), '***.456.789-**', 'RUA A', '10', 'PE', None, 'B1', None,
                      Decimal('-8.058900'), Decimal('-34.885300'))
MEDIDOR = MedidorUC('MD-1', 'M1', 'SMART', date(2020, 1, 1))
GD = GeracaoDistribuidaUC(Decimal('5.00'), 'GERACAO NA PROPRIA UC', date(2025, 2, 1), Decimal('200.00'))


def _fatura(mes, status, pagamento=None):
    return FaturaUC(f'FT-{mes}', mes, Decimal('370.80'), Decimal('115.20'), Decimal('486.00'), 'AMARELA',
                    date(2026, 7, 1), date(2026, 7, 12), pagamento, status)


class RepositorioFalso:
    """Devolve dados prontos e registra as chamadas para conferir os intervalos pedidos."""

    def __init__(self, ficha=FichaUC(CADASTRO, MEDIDOR, GD), meses=None, ultimo='2026-06'):
        self._ficha, self._ultimo, self.chamadas = ficha, ultimo, {}
        self._meses = meses if meses is not None else [
            MesConsumo(somar_meses('2026-06', -i), Decimal('300.00'), Decimal('300.00'), Decimal('0.00'),
                       False, 'REAL') for i in range(24)]

    def buscar(self, **filtros):
        self.chamadas['buscar'] = filtros
        return [RESUMO], 41

    def ultimo_mes(self):
        return self._ultimo

    def ficha(self, id_uc):
        return self._ficha if id_uc == 'UC-1' else None

    def consumo(self, id_uc, inicio, fim):
        self.chamadas['consumo'] = (inicio, fim)
        return [m for m in self._meses if inicio <= m.mes <= fim]

    def faturas_abertas(self, id_uc):
        return [_fatura('2024-11', 'EM ABERTO')]

    def faturas_pagas(self, id_uc, inicio, fim):
        self.chamadas['faturas_pagas'] = (inicio, fim)
        return [_fatura('2026-05', 'PAGA', date(2026, 6, 10))]

    def ultima_leitura(self, id_uc):
        return LeituraUC(date(2026, 6, 28), Decimal('18452.00'), 'ESTIMADA')

    def interrupcoes(self, id_uc, inicio, fim, limite):
        self.chamadas['interrupcoes'] = (inicio, fim, limite)
        abertura = datetime(2026, 6, 14, 19, 20, tzinfo=UTC)
        return [InterrupcaoUC('OC-1', 'ALM-1', 'FALTA DE ENERGIA', 'NAO INFORMADA', abertura,
                              abertura + timedelta(minutes=105), 90)], 3

    def chamados(self, id_uc):
        return [ChamadoUC('AT-1', 'APP', 'FATURA', 'VALOR ALTO', datetime(2026, 7, 2, 10, 5, tzinfo=UTC),
                          datetime(2026, 7, 3, 16, 30, tzinfo=UTC), None, Decimal('30.42'))]

    def metadados(self):
        return METADADOS


def detalhar(repo=None, id_uc='UC-1', **filtros):
    repo = repo or RepositorioFalso()
    resposta = UnidadeService(repo, fonte='real').detalhar(id_uc, FiltroUnidade(**filtros))
    Unidade360.model_validate(resposta)                       # cumpre o contrato
    return resposta


def test_janela_padrao_termina_no_ultimo_mes_da_gold():
    assert janela_padrao('2026-06') == '2025-07/2026-06'
    assert janela_padrao('2026-09') == '2025-10/2026-09'


def test_sem_periodo_usa_a_janela_do_ultimo_mes_da_gold():
    repo = RepositorioFalso(ultimo='2026-09')
    r = detalhar(repo)
    assert r['periodo_referencia'] == '2025-10/2026-09'
    assert repo.chamadas['consumo'] == ('2024-10', '2026-09')        # 12 meses antes da janela
    assert repo.chamadas['faturas_pagas'] == ('2025-10', '2026-09')
    assert repo.chamadas['interrupcoes'] == ('2025-10', '2026-09', 10)


def test_periodo_informado_e_respeitado():
    repo = RepositorioFalso()
    r = detalhar(repo, periodo_atual='2024-07/2025-06')
    assert r['periodo_referencia'] == '2024-07/2025-06'
    assert repo.chamadas['consumo'] == ('2023-07', '2025-06')
    assert [m['mes'] for m in r['consumo']][0] == '2024-07'


def test_uc_inexistente_da_404():
    with pytest.raises(UCInexistenteException):
        UnidadeService(RepositorioFalso(), fonte='real').detalhar('UC-X', FiltroUnidade())


@pytest.mark.parametrize('id_uc', ['UC-1', 'UC-X'])
@pytest.mark.parametrize('periodo', [None, '2025-07/2026-06'])
def test_gold_nao_carregada_vem_antes_do_404(id_uc, periodo):
    # Com a dim_mes vazia, nem a UC existente nem a inexistente respondem 404.
    with pytest.raises(GoldNaoCarregadaException):
        UnidadeService(RepositorioFalso(ultimo=None), fonte='real').detalhar(id_uc, FiltroUnidade(periodo_atual=periodo))


def test_rota_responde_503_gold_nao_carregada():
    app.dependency_overrides[unidades.get_service] = (
        lambda: UnidadeService(RepositorioFalso(ultimo=None), fonte='real'))
    try:
        r = TestClient(app).get('/unidades/UC-1')
    finally:
        app.dependency_overrides.pop(unidades.get_service, None)
    assert r.status_code == 503
    assert r.json() == {'codigo': 'GOLD_NAO_CARREGADA', 'mensagem': GoldNaoCarregadaException.mensagem}


def test_monta_os_blocos_no_formato_do_contrato():
    r = detalhar()
    assert r['cadastro']['cpf_cnpj_mascarado'] == '***.456.789-**' and r['cadastro']['telefone'] is None
    assert r['cadastro']['latitude'] == -8.0589
    assert len(r['consumo']) == 12
    assert r['consumo'][-1] == {
        'mes': '2026-06', 'tipo_leitura': 'REAL',
        'atual': {'valor': 300.0, 'unidade': 'kWh', 'periodo_referencia': '2026-06'},
        'ano_anterior': {'valor': 300.0, 'unidade': 'kWh', 'periodo_referencia': '2025-06'}}
    assert r['diagnostico_conta']['periodo_referencia'] == '2026-06'
    assert r['diagnostico_conta']['veredito'].startswith('Consumo estável')
    assert [f['status'] for f in r['faturas_abertas']] == ['EM ABERTO']   # fora da janela, mas em aberto
    assert r['faturas_pagas'][0]['valor_total'] == 486.0
    assert r['medidor']['ultima_leitura'] == {'data': date(2026, 6, 28), 'leitura_kwh': 18452.0,
                                              'tipo_leitura': 'ESTIMADA'}
    assert r['geracao_distribuida']['energia_injetada_media_mensal'] == {
        'valor': 200.0, 'unidade': 'kWh', 'periodo_referencia': '2025-07/2026-06'}
    assert r['interrupcoes_recentes'][0]['duracao_min'] == 90
    assert r['total_interrupcoes'] == {'valor': 3, 'unidade': 'interrupcoes',
                                       'periodo_referencia': '2025-07/2026-06'}
    assert r['chamados'][0]['nota_satisfacao'] is None                     # null, nunca 0
    assert r['metadados'] == METADADOS


def test_contagens_saem_como_inteiro_no_json():
    # Contagem é inteiro no contrato: "valor": 3, nunca 3.0 (medidas seguem decimais).
    corpo = Unidade360.model_validate(detalhar()).model_dump(mode='json')
    assert type(corpo['total_interrupcoes']['valor']) is int and corpo['total_interrupcoes']['valor'] == 3
    assert type(corpo['interrupcoes_recentes'][0]['duracao_min']) is int
    assert type(corpo['diagnostico_conta']['meses_media']) is int
    assert type(corpo['consumo'][-1]['atual']['valor']) is float          # kWh continua decimal


def test_horarios_de_negocio_mantem_o_relogio_e_ganham_rotulo_local():
    r = detalhar()
    interrupcao, chamado = r['interrupcoes_recentes'][0], r['chamados'][0]
    assert interrupcao['data_abertura'].isoformat() == '2026-06-14T19:20:00-03:00'
    assert interrupcao['data_encerramento'].isoformat() == '2026-06-14T21:05:00-03:00'
    assert chamado['data_abertura'].isoformat() == '2026-07-02T10:05:00-03:00'


def test_hora_local_independe_do_fuso_em_que_o_driver_devolve():
    gravado = datetime(2026, 6, 14, 19, 20, tzinfo=UTC)
    na_sessao_de_recife = gravado.astimezone(timezone(timedelta(hours=-3)))    # 16:20-03:00
    assert hora_local(gravado) == hora_local(na_sessao_de_recife)
    assert hora_local(na_sessao_de_recife).isoformat() == '2026-06-14T19:20:00-03:00'


def test_metadados_da_gold_nao_trocam_de_fuso():
    assert detalhar()['metadados']['gold_atualizada_em'] == '2026-10-25T00:00:00Z'


def test_uc_sem_medidor_e_sem_gd():
    r = detalhar(RepositorioFalso(ficha=FichaUC(CADASTRO, None, None)))
    assert r['medidor'] is None and r['geracao_distribuida'] is None


def test_uc_ligada_em_jan_2026_tem_6_meses_null_e_6_preenchidos():
    ligada = [somar_meses('2026-01', i) for i in range(6)]                    # 2026-01 … 2026-06
    meses = [MesConsumo(m, Decimal('300.00'), None, None, None, 'REAL') for m in ligada]
    consumo = detalhar(RepositorioFalso(meses=meses))['consumo']

    assert [m['mes'] for m in consumo] == [somar_meses('2025-07', i) for i in range(12)]   # eixo fixo
    antes, depois = consumo[:6], consumo[6:]
    assert all(m['atual']['valor'] is None and m['ano_anterior']['valor'] is None
               and m['tipo_leitura'] is None for m in antes)
    assert antes[0]['atual'] == {'valor': None, 'unidade': 'kWh', 'periodo_referencia': '2025-07'}
    assert antes[0]['ano_anterior']['periodo_referencia'] == '2024-07'
    assert all(m['atual']['valor'] == 300.0 and m['tipo_leitura'] == 'REAL' for m in depois)
    assert all(m['ano_anterior']['valor'] is None for m in depois)           # sem ano anterior: null, nunca 0


def test_janela_sem_dado_da_uc_mantem_os_12_meses_nulos():
    r = detalhar(periodo_atual='2028-01/2028-12')
    assert len(r['consumo']) == 12
    assert all(m['atual']['valor'] is None and m['tipo_leitura'] is None for m in r['consumo'])
    assert r['diagnostico_conta']['veredito'] is None


def test_busca_repassa_filtros_e_pagina():
    repo = RepositorioFalso()
    filtros = FiltrosUnidades(busca='titular', municipio='RECIFE', page=2, page_size=5)
    r = UnidadeService(repo, fonte='real').buscar(filtros)
    Unidades.model_validate(r)
    assert repo.chamadas['buscar'] == {'busca': 'titular', 'municipio': 'RECIFE', 'bairro': None,
                                       'classe': None, 'alimentador': None, 'page': 2, 'page_size': 5}
    assert (r['page'], r['page_size'], r['total']) == (2, 5, 41)
    assert r['items'][0]['id_uc'] == 'UC-1' and r['metadados'] == METADADOS


class TestSeed:
    """GOLD_SOURCE=seed: fixture rotulado como fictício, sem tocar no repository."""

    def test_detalhe_e_busca_do_fixture(self):
        servico = UnidadeService(None, fonte='seed')
        assert servico.detalhar('UC-DEMO-001', FiltroUnidade()) == exemplo('unidade')
        assert servico.detalhar('UC-DEMO-007', FiltroUnidade()) == exemplo('unidade_recente')
        assert servico.buscar(FiltrosUnidades(busca='UC-DEMO')) == exemplo('unidades')

    def test_outra_uc_ou_outra_janela(self):
        servico = UnidadeService(None, fonte='seed')
        with pytest.raises(UCInexistenteException):
            servico.detalhar('UC-DEMO-002', FiltroUnidade())
        with pytest.raises(CenarioStubIndisponivelException):
            servico.detalhar('UC-DEMO-001', FiltroUnidade(periodo_atual='2024-07/2025-06'))
