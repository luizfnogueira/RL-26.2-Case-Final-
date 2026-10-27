"""Fixtures exclusivamente sinteticos; cada teste PG usa banco descartavel novo."""
import csv
import hashlib
import json
import os
import subprocess
import sys
import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from app.db.gold_contract import COLUMNS, KEYS, ORDER, TABLES, GoldError, canonical, kind
from app.db.gold_csv import MANIFEST_COLUMNS, iter_rows, validate_files
from app.db.importar_gold_postgres import import_gold


def write_manifest(directory):
    rows = []
    for name in ORDER:
        path = directory / (name + '.csv')
        with path.open(encoding='utf-8', newline='') as stream:
            reader = csv.reader(stream)
            header = next(reader)
            count = sum(1 for _ in reader)
        rows.append(dict(zip(MANIFEST_COLUMNS, [name, path.name, count, len(header), '|'.join(header),
            path.stat().st_size, hashlib.sha256(path.read_bytes()).hexdigest(),
            'SYNTHETIC_V10', 'SYNTHETIC_RUN', '2026-10-25T00:00:00Z'])))
    with (directory / '_manifesto.csv').open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=MANIFEST_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def change(directory, name, column, value):
    path = directory / (name + '.csv')
    with path.open(encoding='utf-8', newline='') as stream:
        rows = list(csv.DictReader(stream))
    rows[0][column] = value
    with path.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS[name])
        writer.writeheader()
        writer.writerows(rows)
    write_manifest(directory)


@pytest.fixture
def package(tmp_path):
    for name in ORDER:
        row = dict.fromkeys(COLUMNS[name], '')
        for c in COLUMNS[name]:
            if c == 'mes_referencia':
                row[c] = '2026-06-01' if name.startswith('tb_fila') else '2026-06'
            elif c == 'id_uc':
                row[c] = 'UC-TEST'
            elif c == 'alimentador':
                row[c] = 'ALM-TEST'
            elif c in KEYS[name]:
                row[c] = 'SYNTHETIC'
            elif c in {'municipio', 'bairro', 'classe', 'status'}:
                row[c] = 'SYNTHETIC'
            elif c == 'cpf_cnpj':
                row[c] = '***.***.***-00'
            elif c == 'acao_recomendada':
                row[c] = 'INSPECAO_PRIORITARIA'
            elif c == 'status_triagem':
                row[c] = 'ELEGIVEL'
            elif c == 'confianca_evidencia':
                row[c] = 'ALTA'
            elif kind(name, c) == 'decimal':
                row[c] = '12.30'
            elif kind(name, c) == 'bool':
                row[c] = 'true'
            elif kind(name, c) == 'int':
                row[c] = '1'
            elif kind(name, c) == 'json':
                row[c] = '["SYNTHETIC"]'
            elif kind(name, c) == 'timestamp':
                row[c] = '2026-10-25T00:00:00Z'
        with (tmp_path / (name + '.csv')).open('w', encoding='utf-8', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=COLUMNS[name])
            writer.writeheader()
            writer.writerow(row)
    write_manifest(tmp_path)
    return tmp_path


def test_manifest_and_all_tables(package):
    assert len(validate_files(package)) == 14
    assert all(len(list(iter_rows(package, n))) == 1 for n in ORDER)


def test_hash_rejected(package):
    with (package / 'dim_uc.csv').open('a') as stream:
        stream.write('\n')
    with pytest.raises(GoldError, match='SHA-256'):
        validate_files(package)


def test_wrong_sha_with_unchanged_file_size(package):
    path = package / '_manifesto.csv'
    with path.open(encoding='utf-8', newline='') as stream:
        rows = list(csv.DictReader(stream))
    rows[0]['sha256'] = '0' * 64
    with path.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=MANIFEST_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    with pytest.raises(GoldError, match='SHA-256'):
        validate_files(package)


def test_missing_file(package):
    (package / 'dim_uc.csv').unlink()
    with pytest.raises(GoldError, match='ausente'):
        validate_files(package)


@pytest.mark.parametrize('duplicate', [False, True])
def test_bad_header(package, duplicate):
    path = package / 'dim_uc.csv'
    lines = path.read_text().splitlines()
    header = lines[0].split(',')
    header[-1] = header[0] if duplicate else 'coluna_incorreta'
    path.write_text(','.join(header) + '\n' + '\n'.join(lines[1:]) + '\n')
    write_manifest(package)
    with pytest.raises(GoldError):
        validate_files(package)


@pytest.mark.parametrize(('column', 'value'), [
    ('data_ligacao', '2026-02-30'), ('_atualizado_em', '2026-01-01T00:00:00'),
    ('latitude', 'NaN'), ('gd_potencia_kwp', '1.001'), ('cpf_cnpj', '123.456.789-00'),
    ('flag_tem_gd', 'yes'),
])
def test_invalid_values(column, value):
    with pytest.raises(GoldError):
        canonical('dim_uc', column, value)


def test_exact_values_nulls_booleans_json():
    assert canonical('fato_uc_mes', 'consumo_kwh_valido', '') is None
    assert canonical('fato_uc_mes', 'valor_total', '0012.30') == '12.30'
    assert canonical('dim_uc', 'flag_tem_gd', 'false') == '0'
    assert canonical('dim_uc', 'flag_tem_gd', '1') == '1'
    assert canonical('dim_uc', 'data_ligacao', '2026-01-01') == '2026-01-01'
    assert canonical('tb_fila_perdas', 'score_bruto', '21.099999999999998') == '21.099999999999998'
    value = '["sintetico", {"a": null}]'
    assert canonical('tb_fila_perdas', 'motivos_json', value) == value
    with pytest.raises(GoldError):
        canonical('tb_fila_perdas', 'motivos_json', '{invalid}')


@pytest.fixture
def pg():
    admin_url = os.getenv('GOLD_TEST_ADMIN_URL')
    if not admin_url:
        pytest.skip('GOLD_TEST_ADMIN_URL necessario para criar banco descartavel')
    url = make_url(admin_url)
    assert url.get_backend_name() == 'postgresql'
    name = 'gold_test_' + uuid.uuid4().hex
    admin = create_engine(url, isolation_level='AUTOCOMMIT', hide_parameters=True)
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    engine = create_engine(url.set(database=name), hide_parameters=True)
    try:
        yield engine
    finally:
        engine.dispose()
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin.dispose()


def portal_snapshot(conn):
    return (
        conn.execute(text('SELECT row_to_json(t)::text FROM portal.ordens_inspecao t ORDER BY id_ordem')).all(),
        conn.execute(text('SELECT row_to_json(t)::text FROM portal.ordens_historico t ORDER BY id_historico')).all(),
        conn.execute(text('SELECT last_value, is_called FROM portal.ordens_inspecao_id_ordem_seq')).all(),
        conn.execute(text('SELECT last_value, is_called FROM portal.ordens_historico_id_historico_seq')).all(),
        conn.execute(text("SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='portal' ORDER BY table_name,ordinal_position")).all(),
        conn.execute(text("SELECT c.oid,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='portal' ORDER BY c.relname")).all(),
    )


def test_pg_load_idempotence_rollback_portal_and_models(package, pg):
    from app.db.base import PortalBase
    from app.models import portal  # noqa
    from app.models.gold_real import DimUC, FilaPerdas
    from sqlalchemy.orm import Session
    with pg.begin() as conn:
        conn.execute(text('CREATE SCHEMA portal'))
        PortalBase.metadata.create_all(conn)
        conn.execute(text("INSERT INTO portal.ordens_inspecao (id_uc,status,equipe_responsavel,data_criacao) VALUES ('UC-TEST','ABERTA','SYNTHETIC',now())"))
        conn.execute(text("INSERT INTO portal.ordens_historico (id_ordem,status_novo,data_mudanca) VALUES (1,'ABERTA',now())"))
        before = portal_snapshot(conn)
    assert import_gold(pg, package) == dict.fromkeys(ORDER, 1)
    with pg.connect() as conn:
        oid = conn.execute(text("SELECT 'gold.dim_uc'::regclass::oid")).scalar_one()
    assert import_gold(pg, package) == dict.fromkeys(ORDER, 1)
    with pg.connect() as conn:
        assert conn.execute(text("SELECT 'gold.dim_uc'::regclass::oid")).scalar_one() == oid
        assert portal_snapshot(conn) == before
        assert conn.execute(text('SELECT consumo_kwh_valido FROM gold.fato_uc_mes')).scalar_one() == Decimal('12.30')
        assert conn.execute(text('SELECT data_ligacao FROM gold.dim_uc')).scalar_one() is None
        assert conn.execute(text('SELECT flag_tem_gd FROM gold.dim_uc')).scalar_one() is True
    with Session(pg) as db:
        assert db.get(DimUC, 'UC-TEST').cpf_cnpj == '***.***.***-00'
        assert json.loads(db.get(FilaPerdas, 'UC-TEST').motivos_json) == ['SYNTHETIC']
    from app.db.verificar_gold import verify
    assert verify(pg, package) == dict.fromkeys(ORDER, 1)
    change(package, 'dim_uc', 'nome_titular', 'SYNTHETIC_CHANGED')
    def fail(name):
        if name == 'fato_uc_mes':
            raise RuntimeError('SYNTHETIC_FAILURE')
    with pytest.raises(RuntimeError, match='SYNTHETIC_FAILURE'):
        import_gold(pg, package, after_publish=fail)
    with pg.connect() as conn:
        assert conn.execute(text('SELECT nome_titular FROM gold.dim_uc')).scalar_one() is None
        assert portal_snapshot(conn) == before
        for name in ORDER:
            assert conn.execute(text(f'SELECT count(*) FROM gold."{name}"')).scalar_one() == 1


@pytest.mark.parametrize('error', ['duplicate', 'reference', 'count', 'month'])
def test_pg_rejects_invalid_package_atomically(package, pg, error):
    import_gold(pg, package)
    if error == 'reference':
        change(package, 'fato_uc_mes', 'id_uc', 'MISSING_SYNTHETIC')
    elif error == 'month':
        change(package, 'tb_fila_perdas', 'mes_referencia', '2025-01-01')
    elif error == 'duplicate':
        path = package / 'dim_uc.csv'
        with path.open('a', encoding='utf-8') as stream:
            stream.write(path.read_text(encoding='utf-8').splitlines()[1] + '\n')
        write_manifest(package)
    else:
        path = package / '_manifesto.csv'
        path.write_text(path.read_text().replace('dim_uc,dim_uc.csv,1,', 'dim_uc,dim_uc.csv,2,'))
    with pytest.raises((GoldError, IntegrityError)):
        import_gold(pg, package)
    with pg.connect() as conn:
        assert conn.execute(text('SELECT count(*) FROM gold.dim_uc')).scalar_one() == 1


def test_pg_legacy_migration_is_explicit(package, pg):
    from app.db import seed
    from app.models import gold
    seed.recarregar_gold(pg, seed.gerar(n_ucs=2))  # Exclusivamente banco sintetico descartavel.
    with pytest.raises(GoldError, match='migracao'):
        import_gold(pg, package)
    assert import_gold(pg, package, migrate_legacy=True)['tb_fila_perdas'] == 1


@pytest.mark.parametrize('status, valor_em_aberto', [('PAGO', 0), ('EM ABERTO', 12.30)])
def test_pg_api_real_source_and_documental_guard(package, pg, status, valor_em_aberto):
    from app.db.base import PortalBase
    from app.models import portal  # noqa
    with pg.begin() as conn:
        conn.execute(text('CREATE SCHEMA portal'))
        PortalBase.metadata.create_all(conn)
    change(package, 'fato_uc_mes', 'status', status)
    import_gold(pg, package)
    env = dict(os.environ, GOLD_SOURCE='real', DATABASE_URL=pg.url.render_as_string(hide_password=False),
               EXPECTED_OPEN_VALUE=str(valor_em_aberto))
    check = """
from fastapi.testclient import TestClient
from app.main import app
import os
with TestClient(app) as client:
    r = client.get('/inspecoes/candidatos', params={'periodo_atual':'2025-07/2026-06'})
    assert r.status_code == 200
    assert r.json()['total'] == 1
    assert r.json()['metadados']['dados_ficticios'] is False
    r = client.get('/dashboard', params={'periodo_atual':'2025-07/2026-06','periodo_comparacao':'2022-07/2023-06'})
    assert r.status_code == 200
    data = r.json()
    assert data['indicadores']['inadimplencia']['atual']['valor'] == float(os.environ['EXPECTED_OPEN_VALUE'])
    assert data['metadados']['dados_ficticios'] is False
    assert data['metadados']['gold_atualizada_em'] is not None
    assert data['ponte_receita']['receita_energia_atual']['valor'] is not None
    assert data['drill_down']['total'] == 1
    r = client.get('/filtros')
    assert r.status_code == 200
    assert r.json()['municipios'] == ['SYNTHETIC']
    assert r.json()['metadados']['dados_ficticios'] is False
    assert r.json()['metadados']['gold_atualizada_em'] is not None
"""
    result = subprocess.run([sys.executable, '-c', check], env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    change(package, 'tb_fila_perdas', 'acao_recomendada', 'VALIDACAO_DOCUMENTAL')
    import_gold(pg, package)
    check = """
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app) as client:
    r = client.get('/inspecoes/candidatos', params={'periodo_atual':'2025-07/2026-06'})
    assert r.status_code == 200 and r.json()['total'] == 0
    r = client.post('/inspecoes', json={'id_uc':'UC-TEST','equipe_responsavel':'SYNTHETIC'})
    assert r.status_code == 422
"""
    result = subprocess.run([sys.executable, '-c', check], env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    with pg.connect() as conn:
        assert conn.execute(text('SELECT count(*) FROM portal.ordens_inspecao')).scalar_one() == 0
