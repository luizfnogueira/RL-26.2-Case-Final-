"""R1a no PostgreSQL: Gold de contrato real e seed, sempre em bancos descartáveis.

Reutiliza o pacote sintético e a fixture que cria/remove gold_test_<uuid>.
Requer GOLD_TEST_ADMIN_URL; não modifica a Gold de desenvolvimento/produção.
"""
import os
import subprocess
import sys

from sqlalchemy import insert

from app.db.gold_contract import TABLES
from app.db.importar_gold_postgres import import_gold
from tests.test_gold_import import package, pg  # noqa: F401 (fixtures existentes)
from tests.test_operacao_service import BAIRROS, meses_exemplo


def executar_api(pg, codigo, fonte):
    env = dict(os.environ, GOLD_SOURCE=fonte, DATABASE_URL=pg.url.render_as_string(hide_password=False),
               PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
    resultado = subprocess.run([sys.executable, '-c', codigo], env=env, capture_output=True, encoding='utf-8')
    assert resultado.returncode == 0, resultado.stderr


VERIFICAR_GOLD = """
from fastapi.testclient import TestClient
from sqlalchemy import event
from app.db.session import engine
from app.main import app

consultas = []
event.listen(engine, 'before_cursor_execute', lambda conn, cursor, statement, params, context, many: consultas.append(statement))

with TestClient(app) as client:
    def get(**params):
        r = client.get('/operacao', params={'periodo_atual': '2026-05/2026-06', **params})
        assert r.status_code == 200, r.text
        return r.json()

    dados = get()
    a, b, c = dados['ranking_alimentadores']['items']
    assert [r['alimentador'] for r in (a,b,c)] == ['ALM-A','ALM-B','ALM-C']
    assert (a['dec']['valor'],a['fec']['valor'],a['horas_interrupcao']['valor'],a['interrupcoes']['valor']) == (4,.7,700,120)
    assert (a['dec_sem_dia_critico']['valor'],a['fec_sem_dia_critico']['valor']) == (2.4,.4)
    assert (a['ucs_atendidas'],b['ucs_atendidas']) == (200,100)
    assert a['bairros_atendidos'] == ['CENTRO','COMPARTILHADO']
    assert b['bairros_atendidos'] == ['BAIRRO COM, VIRGULA','COMPARTILHADO']
    assert c['dec']['valor'] == c['fec']['valor'] == 0
    assert dados['metadados']['dados_ficticios'] is False
    assert dados['metadados']['gold_atualizada_em'].startswith('2026-10-25')

    recife,olinda = dados['ranking_regional']['items']
    assert recife['municipio'] == 'RECIFE' and recife['bairro'] is None
    assert recife['dec']['valor'] == 4.8333
    assert recife['fec']['valor'] == .7167
    assert recife['dec_sem_dia_critico']['valor'] == 2.5167
    assert recife['fec_sem_dia_critico']['valor'] == .4083
    assert recife['interrupcoes']['valor'] == 250 and recife['horas_interrupcao']['valor'] == 1700
    assert olinda['municipio'] == 'OLINDA' and olinda['dec']['valor'] == 0
    assert [p['mes'] for p in dados['serie_historica'][0]['pontos']] == ['2026-05','2026-06']

    assert [r['alimentador'] for r in get(ordenar_por='chi')['ranking_alimentadores']['items']] == ['ALM-B','ALM-A','ALM-C']
    assert [r['alimentador'] for r in get(ordenar_por='fec')['ranking_alimentadores']['items']] == ['ALM-A','ALM-B','ALM-C']
    paginado = get(page=3,page_size=1)
    assert paginado['ranking_alimentadores']['total'] == 3
    assert paginado['ranking_alimentadores']['items'][0]['posicao'] == 3
    assert paginado['ranking_regional']['total'] == 2 and paginado['ranking_regional']['items'] == []
    assert len(paginado['serie_historica']) == 3
    assert all(len(s['pontos']) == 2 for s in paginado['serie_historica'])

    bairros = get(nivel_regional='bairro')['ranking_regional']
    assert bairros['total'] == 4 and bairros['nivel_regional'] == 'bairro'
    assert {(r['municipio'],r['bairro']) for r in bairros['items']} == {('RECIFE','CENTRO'),('RECIFE','COMPARTILHADO'),('RECIFE','BAIRRO COM, VIRGULA'),('OLINDA','CENTRO')}
    filtrado = get(municipio='RECIFE',bairro='CENTRO',nivel_regional='bairro')
    assert filtrado['ranking_alimentadores']['total'] == 1
    assert filtrado['ranking_alimentadores']['items'][0]['dec']['valor'] == 4
    assert filtrado['ranking_alimentadores']['items'][0]['ucs_atendidas'] == 200
    assert filtrado['ranking_regional']['items'][0]['bairro'] == 'CENTRO'
    compartilhado = get(municipio='RECIFE',bairro='COMPARTILHADO',nivel_regional='bairro')
    assert compartilhado['ranking_alimentadores']['total'] == 2
    assert compartilhado['ranking_regional']['total'] == 1
    assert compartilhado['ranking_regional']['items'][0]['dec']['valor'] == 4.8333
    com_virgula = get(municipio='RECIFE',bairro='BAIRRO COM, VIRGULA')
    assert com_virgula['ranking_alimentadores']['items'][0]['alimentador'] == 'ALM-B'
    unico = get(alimentador='ALM-B')
    assert len(unico['serie_historica']) == 1 and unico['ranking_alimentadores']['total'] == 1
    assert get(alimentador='ALM-B',municipio='OLINDA')['serie_historica'] == []
    assert get(municipio='recife')['serie_historica'] == []  # valor exato da Gold
    assert get(periodo_atual='2027-01')['ranking_alimentadores']['total'] == 0
    assert get(periodo_atual='2026-05')['ranking_alimentadores']['items'][0]['dec']['valor'] == 3
    assert len(get(periodo_atual='2026-05')['serie_historica'][0]['pontos']) == 1
    assert client.get('/operacao',params={'periodo_atual':'2026-05','classe':'RESIDENCIAL'}).json()['codigo'] == 'DADOS_INVALIDOS'

assert consultas and all(q.lstrip().upper().startswith('SELECT') for q in consultas), consultas
"""


def test_operacao_le_gold_real_com_filtros_cc_mensal_e_somente_select(package, pg):
    import_gold(pg, package)
    linhas = meses_exemplo()
    with pg.begin() as conn:
        conn.execute(TABLES['agg_dec_fec_mensal'].delete())
        conn.execute(insert(TABLES['dim_mes']), {'mes_referencia': '2026-05'})
        for alimentador, bairros in BAIRROS.items():
            municipio = 'OLINDA' if alimentador == 'ALM-C' else 'RECIFE'
            conn.execute(insert(TABLES['dim_alimentador']), {
                'alimentador': alimentador, 'municipio': municipio,
                'bairros_atendidos': ', '.join(bairros),
            })
            for indice, bairro in enumerate([*bairros, bairros[0]]):
                # Há poucos cadastros sintéticos, mas o Cc Gold é 100/200/300:
                # a API deve manter o denominador mensal, não contar essas UCs.
                conn.execute(insert(TABLES['dim_uc']), {
                    'id_uc': f'UC-{alimentador}-{indice}', 'nome_titular': 'SYNTHETIC',
                    'alimentador': alimentador, 'municipio': municipio, 'bairro': bairro,
                })
        conn.execute(insert(TABLES['agg_dec_fec_mensal']), linhas)
    executar_api(pg, VERIFICAR_GOLD, 'real')


VERIFICAR_SEED = """
from fastapi.testclient import TestClient
from sqlalchemy import event,func,select
from sqlalchemy.orm import Session
from app.db.session import engine
from app.main import app
from app.models.gold import DecFecAlimentadorMes as M

with Session(engine) as db:
    nome = db.scalar(select(M.alimentador).order_by(M.alimentador).limit(1))
    dec,fec,chi,interrupcoes = db.execute(select(func.sum(M.dec),func.sum(M.fec),func.sum(M.horas_interrupcao),func.sum(M.interrupcoes)).where(M.alimentador==nome,M.mes_referencia.between('2025-07','2026-06'))).one()
    cc_final = db.scalar(select(M.ucs_total).where(M.alimentador==nome,M.mes_referencia=='2026-06'))

consultas = []
event.listen(engine, 'before_cursor_execute', lambda conn,cursor,statement,params,context,many: consultas.append(statement))
with TestClient(app) as client:
    r = client.get('/operacao',params={'periodo_atual':'2025-07/2026-06','alimentador':nome})
    assert r.status_code == 200, r.text
    dados = r.json()
    [a] = dados['ranking_alimentadores']['items']
    assert abs(a['dec']['valor']-float(dec)) < .0001
    assert abs(a['fec']['valor']-float(fec)) < .0001
    assert a['horas_interrupcao']['valor'] == float(chi)
    assert a['interrupcoes']['valor'] == interrupcoes and a['ucs_atendidas'] == cc_final
    assert a['dec_sem_dia_critico']['valor'] is None and a['fec_sem_dia_critico']['valor'] is None
    assert all(p['dec_sem_dia_critico']['valor'] is None for p in dados['serie_historica'][0]['pontos'])
    assert len(dados['serie_historica'][0]['pontos']) == 12
    assert dados['metadados']['dados_ficticios'] is True
    assert dados['metadados']['gold_atualizada_em'] is None
    mensal = client.get('/operacao',params={'periodo_atual':'2024-03','alimentador':nome})
    assert mensal.status_code == 200, mensal.text
    assert len(mensal.json()['serie_historica'][0]['pontos']) == 1
assert consultas and all(q.lstrip().upper().startswith('SELECT') for q in consultas), consultas
"""


def test_operacao_le_seed_postgresql_e_informa_expurgo_ausente(pg):
    from app.db import seed
    seed.recarregar_gold(pg, seed.gerar(n_ucs=30, semente=21))
    executar_api(pg, VERIFICAR_SEED, 'seed')
