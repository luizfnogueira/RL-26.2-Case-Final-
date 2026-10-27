"""Verificacao somente leitura de contagens e manifesto da carga publicada."""
import argparse
import json
from pathlib import Path
from sqlalchemy import create_engine, text
from app.db.gold_contract import ORDER, GoldError
from app.db.gold_csv import validate_manifest, validate_files


def verify(engine, directory=None):
    with engine.connect() as conn:
        conn.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
        meta = {name: json.loads(value)['manifest'] for name, value in conn.execute(text('SELECT tabela, metadata_json FROM gold._carga_metadata'))}
        validate_manifest(list(meta.values()))
        if directory is not None and validate_files(Path(directory)) != meta:
            raise GoldError('Manifesto privado difere da carga publicada')
        counts = {}
        for name in ORDER:
            counts[name] = conn.execute(text(f'SELECT count(*) FROM gold."{name}"')).scalar_one()
            if counts[name] != int(meta[name]['linhas']):
                raise GoldError(f'{name}: contagem divergente')
        return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv-dir', type=Path)
    args = parser.parse_args()
    from app.core.config import DATABASE_URL
    engine = create_engine(DATABASE_URL, hide_parameters=True)
    try:
        print(json.dumps(verify(engine, args.csv_dir), indent=2))
    except GoldError as exc:
        print(str(exc))
        raise SystemExit(1) from None
    except Exception as exc:
        print(f'Verificacao falhou ({type(exc).__name__}); confira conexao e carga.')
        raise SystemExit(1) from None
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()
