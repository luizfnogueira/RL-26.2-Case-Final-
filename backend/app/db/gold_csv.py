"""Validacao do pacote privado de CSVs Gold, sem banco intermediario."""
import csv
import hashlib
import logging
from pathlib import Path

from app.db.gold_contract import COLUMNS, ORDER, GoldError, canonical

LOG = logging.getLogger(__name__)
DEFAULT_DIR = Path(__file__).resolve().parents[2] / 'data' / 'gold'
MANIFEST_COLUMNS = 'tabela arquivo linhas n_colunas colunas tamanho_bytes sha256 versao_regra_fila id_execucao_fila exportado_em_utc'.split()


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_manifest(directory):
    path = directory / '_manifesto.csv'
    if not path.is_file():
        raise GoldError('Manifesto ausente')
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream, strict=True)
        if reader.fieldnames != MANIFEST_COLUMNS:
            raise GoldError('Cabecalho do manifesto divergente')
        rows = list(reader)
    validate_manifest(rows)
    return {r['tabela']: r for r in rows}


def validate_manifest(rows):
    if len(rows) != len(ORDER) or {r.get('tabela') for r in rows} != set(ORDER):
        raise GoldError('Manifesto deve conter exatamente as 14 tabelas, sem repeticoes')
    for r in rows:
        name = r['tabela']
        try:
            if set(r) != set(MANIFEST_COLUMNS) or not all(isinstance(r[k], str) for k in MANIFEST_COLUMNS):
                raise ValueError()
            if r['arquivo'] != name + '.csv' or r['colunas'].split('|') != COLUMNS[name]:
                raise ValueError()
            if int(r['n_colunas']) != len(COLUMNS[name]) or int(r['linhas']) < 0 or int(r['tamanho_bytes']) < 0:
                raise ValueError()
            if len(r['sha256']) != 64 or any(c not in '0123456789abcdef' for c in r['sha256']):
                raise ValueError()
            canonical('dim_mes', '_atualizado_em', r['exportado_em_utc'])
            if not all(r[k] for k in MANIFEST_COLUMNS):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            raise GoldError(f'{name}: manifesto invalido') from None
    for key in ('versao_regra_fila', 'id_execucao_fila', 'exportado_em_utc'):
        if len({r[key] for r in rows}) != 1:
            raise GoldError('Manifesto mistura execucoes')


def validate_files(directory):
    manifest = read_manifest(directory)
    for name in ORDER:
        row = manifest[name]
        path = directory / row['arquivo']
        if not path.is_file():
            raise GoldError(f'{name}: arquivo ausente')
        if path.stat().st_size != int(row['tamanho_bytes']) or sha256(path) != row['sha256']:
            raise GoldError(f'{name}: tamanho ou SHA-256 divergente')
        with path.open(encoding='utf-8-sig', newline='') as stream:
            header = next(csv.reader(stream, strict=True), [])
        if len(header) != len(set(header)) or header != COLUMNS[name]:
            raise GoldError(f'{name}: cabecalho divergente ou duplicado')
        LOG.info('%s: arquivo e hash validados', name)
    return manifest



def iter_rows(directory, name):
    """Leitura limitada a uma linha; erros nunca incluem valores da fonte."""
    try:
        with (Path(directory) / (name + '.csv')).open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.reader(stream, strict=True)
            if next(reader, []) != COLUMNS[name]:
                raise GoldError(f'{name}: cabecalho alterado durante a carga')
            for line_number, row in enumerate(reader, 2):
                if len(row) != len(COLUMNS[name]):
                    raise GoldError(f'{name}: numero de campos invalido na linha {line_number}')
                yield tuple(canonical(name, c, v) for c, v in zip(COLUMNS[name], row))
    except (csv.Error, UnicodeError):
        raise GoldError(f'{name}: CSV invalido') from None
