"""CSV -> PostgreSQL gold. Staging, COPY e publicacao numa unica transacao."""
import argparse
import json
import logging
from itertools import batched
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.schema import CreateColumn

from app.db.gold_csv import DEFAULT_DIR, iter_rows, validate_files
from app.db.gold_contract import COLUMNS, KEYS, ORDER, TABLES, GoldError, metadata, references

LOG = logging.getLogger(__name__)


def prepare(conn, migrate_legacy=False):
    """Apenas Gold. Migracao aditiva opt-in das duas tabelas provisorias da fila."""
    conn.execute(text('CREATE SCHEMA IF NOT EXISTS gold'))
    # Dependencias externas nao podem propagar efeitos de uma recarga ao portal.
    if conn.execute(text("""
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='gold' AND NOT t.tgisinternal LIMIT 1
    """)).first():
        raise GoldError('Gold possui triggers de usuario; revisao manual necessaria')
    if conn.execute(text("""
        SELECT 1 FROM pg_constraint fk
        JOIN pg_class child ON child.oid=fk.conrelid
        JOIN pg_namespace cn ON cn.oid=child.relnamespace
        JOIN pg_class parent ON parent.oid=fk.confrelid
        JOIN pg_namespace pn ON pn.oid=parent.relnamespace
        WHERE fk.contype='f' AND pn.nspname='gold' AND cn.nspname<>'gold'
        AND fk.confdeltype IN ('c','n','d') LIMIT 1
    """)).first():
        raise GoldError('FK externa propaga exclusoes da Gold; revisao manual necessaria')
    inspector = inspect(conn)
    for name in ORDER:
        if not inspector.has_table(name, schema='gold'):
            continue
        current = {c['name']: c for c in inspector.get_columns(name, schema='gold')}
        target = TABLES[name]
        missing = set(COLUMNS[name]) - set(current)
        legacy = name in {'tb_fila_perdas', 'tb_fila_perdas_auditoria'} and missing
        if missing and not (legacy and migrate_legacy):
            raise GoldError(f'{name}: migracao necessaria; consulte a documentacao tecnica compartilhada pela equipe')
        if legacy and migrate_legacy:
            for column in target.columns:
                if column.name not in current:
                    ddl = str(CreateColumn(column).compile(dialect=conn.dialect))
                    conn.execute(text(f'ALTER TABLE gold."{name}" ADD COLUMN {ddl}'))
        for column in target.columns:
            old = current.get(column.name)
            if old is None:
                continue
            old_type = str(old['type'].compile(dialect=conn.dialect))
            new_type = str(column.type.compile(dialect=conn.dialect))
            if old_type != new_type:
                if legacy and migrate_legacy:
                    conn.execute(text(f'ALTER TABLE gold."{name}" ALTER COLUMN "{column.name}" TYPE {new_type} USING "{column.name}"::{new_type}'))
                else:
                    raise GoldError(f'{name}.{column.name}: tipo PostgreSQL divergente')
        if set(current) - set(COLUMNS[name]):
            raise GoldError(f'{name}: colunas extras; migracao manual necessaria')
        if tuple(inspector.get_pk_constraint(name, schema='gold')['constrained_columns']) != KEYS[name]:
            raise GoldError(f'{name}: chave PostgreSQL divergente')
    metadata.create_all(conn)
    conn.execute(text('CREATE TABLE IF NOT EXISTS gold._carga_metadata (tabela TEXT PRIMARY KEY, metadata_json TEXT NOT NULL)'))
    # Indices das FKs e filtros mais usados pela API.
    for name in ORDER:
        for c in set(references(name)) | (set(COLUMNS[name]) & {'municipio', 'bairro', 'classe'}):
            conn.execute(text(f'CREATE INDEX IF NOT EXISTS "ix_gold_{name}_{c}" ON gold."{name}" ("{c}")'))


def check_stage(conn, counts):
    for name in ORDER:
        stage = f'gold_stage_{name}'
        if conn.execute(text(f'SELECT count(*) FROM "{stage}"')).scalar_one() != counts[name]:
            raise GoldError(f'{name}: contagem staging divergente')
        keys = ','.join(f'"{c}"' for c in KEYS[name])
        conn.execute(text(f'ALTER TABLE "{stage}" ADD PRIMARY KEY ({keys})'))
        for c, parent in references(name).items():
            if conn.execute(text(
                f'SELECT 1 FROM "{stage}" c LEFT JOIN "gold_stage_{parent}" p '
                f'ON c."{c}" = p."{c}" WHERE c."{c}" IS NOT NULL AND p."{c}" IS NULL LIMIT 1'
            )).first():
                raise GoldError(f'{name}.{c}: integridade staging invalida')
        if name.startswith('tb_fila') and conn.execute(text(
            f'SELECT 1 FROM "{stage}" c LEFT JOIN gold_stage_dim_mes p '
            "ON to_char(c.mes_referencia, 'YYYY-MM') = p.mes_referencia "
            'WHERE c.mes_referencia IS NOT NULL AND p.mes_referencia IS NULL LIMIT 1'
        )).first():
            raise GoldError(f'{name}: mes ausente do calendario')


def import_gold(engine, source, batch_size=5000, migrate_legacy=False, after_publish=None):
    if engine.dialect.name != 'postgresql' or batch_size <= 0:
        raise GoldError('Requer PostgreSQL e lote positivo')
    source = Path(source)
    manifest = validate_files(source)
    counts = {n: int(manifest[n]['linhas']) for n in ORDER}
    meta = {n: {'manifest': manifest[n], 'format_version': 1, 'source': 'CSV'} for n in ORDER}
    with engine.begin() as conn:
        conn.execute(text("SELECT pg_advisory_xact_lock(672602360)"))
        conn.execute(text("SET LOCAL lock_timeout = '30s'"))
        prepare(conn, migrate_legacy)
        all_tables = ', '.join(f'gold."{n}"' for n in ORDER)
        conn.execute(text(f'LOCK TABLE {all_tables} IN SHARE ROW EXCLUSIVE MODE'))
        raw = conn.connection.driver_connection
        for name in ORDER:
            stage = f'gold_stage_{name}'
            fields = ','.join(f'"{c}"' for c in COLUMNS[name])
            definitions = ','.join(str(CreateColumn(c).compile(dialect=conn.dialect)) for c in TABLES[name].columns)
            conn.execute(text(f'CREATE TEMP TABLE "{stage}" ({definitions}) ON COMMIT DROP'))
            count = 0
            with raw.cursor() as pg:
                with pg.copy(f'COPY "{stage}" ({fields}) FROM STDIN') as copy:
                    for batch in batched(iter_rows(source, name), batch_size):
                        for row in batch:
                            copy.write_row(row)
                        count += len(batch)
                        if count % 100000 == 0:
                            LOG.info('%s: COPY %d linhas', name, count)
            LOG.info('%s: staging carregado (%d linhas)', name, count)
        if validate_files(source) != manifest:
            raise GoldError('Fonte alterada durante a carga')
        check_stage(conn, counts)
        # Upsert preserva identidade/OIDs e FKs externas para chaves existentes.
        for name in ORDER:
            fields = ','.join(f'"{c}"' for c in COLUMNS[name])
            keys = ','.join(f'"{c}"' for c in KEYS[name])
            updates = ','.join(f'"{c}"=EXCLUDED."{c}"' for c in COLUMNS[name] if c not in KEYS[name])
            non_keys = [c for c in COLUMNS[name] if c not in KEYS[name]]
            old_values = ','.join(f'target."{c}"' for c in non_keys)
            new_values = ','.join(f'EXCLUDED."{c}"' for c in non_keys)
            action = (f'DO UPDATE SET {updates} WHERE ({old_values}) IS DISTINCT FROM ({new_values})'
                      if updates else 'DO NOTHING')
            conn.execute(text(f'INSERT INTO gold."{name}" AS target ({fields}) SELECT {fields} FROM "gold_stage_{name}" ON CONFLICT ({keys}) {action}'))
            LOG.info('%s: publicado dentro da transacao', name)
            if after_publish:
                after_publish(name)  # Injetor de falhas apenas para testes, sem opcao CLI.
        for name in reversed(ORDER):
            match = ' AND '.join(f's."{c}" = g."{c}"' for c in KEYS[name])
            conn.execute(text(f'DELETE FROM gold."{name}" g WHERE NOT EXISTS (SELECT 1 FROM "gold_stage_{name}" s WHERE {match})'))
        for name in ORDER:
            actual = conn.execute(text(f'SELECT count(*) FROM gold."{name}"')).scalar_one()
            if actual != counts[name]:
                raise GoldError(f'{name}: contagem final divergente')
            conn.execute(text(
                'INSERT INTO gold._carga_metadata VALUES (:tabela, :meta) '
                'ON CONFLICT (tabela) DO UPDATE SET metadata_json=EXCLUDED.metadata_json'
            ), {'tabela': name, 'meta': json.dumps(meta[name])})
        LOG.info('Validacao final concluida. COMMIT da Gold; nenhuma escrita em portal.')
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv-dir', type=Path, default=DEFAULT_DIR)
    parser.add_argument('--batch-size', type=int, default=5000)
    parser.add_argument('--migrate-legacy', action='store_true')
    args = parser.parse_args()
    from app.core.config import DATABASE_URL
    engine = create_engine(DATABASE_URL, hide_parameters=True)
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    try:
        print(json.dumps(import_gold(engine, args.csv_dir, args.batch_size, args.migrate_legacy), indent=2))
    except GoldError as exc:
        LOG.error('%s; carga rejeitada, transacao revertida.', exc)
        raise SystemExit(1) from None
    except Exception as exc:
        # Erros do driver podem incluir valores de COPY; nunca imprimir a mensagem.
        LOG.error('Falha PostgreSQL/arquivo (%s); transacao revertida. Verifique conexao e contrato.', type(exc).__name__)
        raise SystemExit(1) from None
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()
