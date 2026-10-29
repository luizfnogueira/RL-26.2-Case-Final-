"""V1a: GET /unidades e /unidades/{id} contra a Gold real importada num banco descartável.

Fixtures exclusivamente sintéticas (as de test_gold_import). Exige GOLD_TEST_ADMIN_URL. A API roda num
subprocesso com GOLD_SOURCE=real, porque a fonte é lida uma única vez, ao importar a configuração.
"""
import os
import subprocess
import sys

from sqlalchemy import text

from app.db.importar_gold_postgres import import_gold
from tests.test_gold_import import change, package, pg  # noqa: F401  (fixtures)

# Campos que o pacote genérico deixa vazios e a Visão 360 exige (a Gold real não os tem nulos).
PREENCHER = {
    'dim_uc': {'nome_titular': 'TITULAR SINTETICO', 'uf': 'PE', 'id_medidor': 'MD-TEST',
               'tipo_medidor': 'SMART', 'data_instalacao_medidor': '2020-01-01',
               'gd_modalidade': 'GERACAO NA PROPRIA UC', 'gd_data_conexao': '2024-01-01'},
    'fato_uc_mes': {'id_fatura': 'FT-TEST', 'status': 'EM ABERTO', 'bandeira_tarifaria': 'AMARELA',
                    'data_emissao': '2026-07-01', 'data_vencimento': '2026-07-12', 'id_leitura': 'LT-TEST',
                    'data_leitura': '2026-06-28', 'tipo_leitura': 'ESTIMADA'},
    'uc_consumo_comparativo': {'tipo_leitura': 'REAL'},
    'uc_interrupcoes': {'tipo': 'FALTA DE ENERGIA', 'causa': 'NAO INFORMADA', 'flag_sem_interrupcao': 'false',
                        'flag_antes_ligacao': 'false', 'duracao_min': '45', 'duracao_efetiva_min': '30',
                        # hora local de Recife que o CSV da Gold marca como UTC
                        'data_abertura': '2026-06-14T19:20:00Z', 'data_encerramento': '2026-06-14T20:05:00Z'},
    'uc_atendimentos': {'canal': 'APP', 'assunto': 'FATURA', 'subassunto': 'VALOR ALTO'},
}

VERIFICAR = """
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as client:
    r = client.get('/unidades', params={'busca': 'uc-te'})
    assert r.status_code == 200, r.text
    busca = r.json()
    assert busca['total'] == 1 and busca['items'][0]['id_uc'] == 'UC-TEST'
    assert busca['metadados']['dados_ficticios'] is False and busca['metadados']['gold_atualizada_em']
    assert client.get('/unidades', params={'busca': 'inexistente'}).json()['total'] == 0
    # Região com o valor exato da Gold, como o /dashboard; só a busca livre ignora maiúsculas.
    assert client.get('/unidades', params={'municipio': 'SYNTHETIC'}).json()['total'] == 1
    assert client.get('/unidades', params={'municipio': 'synthetic'}).json()['total'] == 0
    assert client.get('/unidades', params={'busca': 'UC-te', 'classe': 'SYNTHETIC'}).json()['total'] == 1
    assert client.get('/unidades', params={'busca': 'UC-te', 'classe': 'Synthetic'}).json()['total'] == 0
    assert client.get('/unidades', params={'busca': 'ab'}).json()['codigo'] == 'DADOS_INVALIDOS'

    r = client.get('/unidades/UC-TEST')
    assert r.status_code == 200, r.text
    uc = r.json()
    assert uc['periodo_referencia'] == '2025-07/2026-06'            # termina no último mês da dim_mes
    assert uc['cadastro']['cpf_cnpj_mascarado'] == '***.***.***-00' and uc['cadastro']['telefone'] is None

    consumo = uc['consumo']
    assert [m['mes'] for m in consumo][0] == '2025-07' and len(consumo) == 12
    assert all(m['atual']['valor'] is None and m['tipo_leitura'] is None for m in consumo[:11])
    assert consumo[-1]['atual']['valor'] == 12.3 and consumo[-1]['tipo_leitura'] == 'REAL'

    d = uc['diagnostico_conta']
    assert d['periodo_referencia'] == '2026-06' and d['conta_alta'] is True      # flag da Gold
    assert d['variacao_percentual']['valor'] == 12.3 and d['meses_media'] == 0
    assert 'Troca de medidor em 2026-06' in d['alerta']

    assert [f['status'] for f in uc['faturas_abertas']] == ['EM ABERTO'] and uc['faturas_pagas'] == []
    assert uc['medidor']['id_medidor'] == 'MD-TEST'
    assert uc['medidor']['ultima_leitura']['tipo_leitura'] == 'ESTIMADA'
    assert uc['geracao_distribuida']['potencia_kwp'] == 12.3

    [interrupcao] = uc['interrupcoes_recentes']
    assert interrupcao['data_abertura'] == '2026-06-14T19:20:00-03:00'          # relógio mantido
    assert interrupcao['duracao_min'] == 30                                       # efetiva, como no DEC
    assert uc['total_interrupcoes']['valor'] == 1 and type(uc['total_interrupcoes']['valor']) is int
    assert type(interrupcao['duracao_min']) is int                                # contagens: inteiro
    assert uc['chamados'][0]['nota_satisfacao'] == 12.3

    r = client.get('/unidades/UC-NAO-EXISTE')
    assert (r.status_code, r.json()['codigo']) == (404, 'UC_INEXISTENTE')
    r = client.get('/unidades/UC-TEST', params={'periodo_atual': '2026-06'})
    assert (r.status_code, r.json()['codigo']) == (422, 'DADOS_INVALIDOS')

    r = client.get('/unidades/UC-TEST', params={'periodo_atual': '2024-07/2025-06'})
    assert r.status_code == 200, r.text
    fora = r.json()
    assert len(fora['consumo']) == 12 and all(m['atual']['valor'] is None for m in fora['consumo'])
    assert fora['diagnostico_conta']['veredito'] is None and fora['total_interrupcoes']['valor'] == 0
"""


def test_visao_360_le_a_gold_real(package, pg):
    from app.db.base import PortalBase
    from app.models import portal  # noqa: F401
    with pg.begin() as conn:
        conn.execute(text('CREATE SCHEMA portal'))
        PortalBase.metadata.create_all(conn)
    for tabela, colunas in PREENCHER.items():
        for coluna, valor in colunas.items():
            change(package, tabela, coluna, valor)
    import_gold(pg, package)

    env = dict(os.environ, GOLD_SOURCE='real', DATABASE_URL=pg.url.render_as_string(hide_password=False))
    resultado = subprocess.run([sys.executable, '-c', VERIFICAR], env=env, capture_output=True, text=True)
    assert resultado.returncode == 0, resultado.stderr
