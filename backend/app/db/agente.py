"""Schema agente e usuário somente leitura do assistente de IA (GENAI-5).

Rodar depois de carregar a Gold (e de novo se ela for restaurada num banco novo):
    docker compose exec api python -m app.db.agente
"""
from psycopg import sql

from app.core.config import AGENTE_DB_PASSWORD, AGENTE_DB_USER
from app.db.gold_contract import COLUMNS
from app.db.session import engine

# A auditoria da fila fica de fora: é técnica e o contrato Gold → API não a lista.
TABELAS_AGENTE = (
    'dim_mes', 'dim_uc', 'dim_alimentador', 'fato_uc_mes', 'fato_alimentador_mes',
    'agg_receita_mensal', 'agg_preco_volume', 'agg_kpis_mensal', 'agg_dec_fec_mensal',
    'uc_consumo_comparativo', 'uc_interrupcoes', 'uc_atendimentos', 'tb_fila_perdas',
)
# Dados pessoais da dim_uc que o assistente nunca vê (o cpf já vem mascarado, mas também sai).
COLUNAS_PESSOAIS = {'cpf_cnpj', 'nome_titular', 'logradouro', 'numero', 'cep', 'latitude', 'longitude'}


def colunas_da_view(tabela: str) -> list[str]:
    return [c for c in COLUMNS[tabela] if c not in COLUNAS_PESSOAIS and c != '_atualizado_em']


def main():
    if not AGENTE_DB_PASSWORD:
        raise SystemExit('Defina AGENTE_DB_PASSWORD no backend/.env antes de rodar.')
    usuario = sql.Identifier(AGENTE_DB_USER)
    conexao = engine.raw_connection()
    try:
        with conexao.cursor() as cursor:
            cursor.execute('CREATE SCHEMA IF NOT EXISTS agente')
            for tabela in TABELAS_AGENTE:
                colunas = sql.SQL(', ').join(map(sql.Identifier, colunas_da_view(tabela)))
                cursor.execute(sql.SQL('CREATE OR REPLACE VIEW agente.{} AS SELECT {} FROM gold.{}').format(
                    sql.Identifier(tabela), colunas, sql.Identifier(tabela)))
            cursor.execute('SELECT 1 FROM pg_roles WHERE rolname = %s', (AGENTE_DB_USER,))
            acao = 'ALTER' if cursor.fetchone() else 'CREATE'
            cursor.execute(sql.SQL(acao + ' ROLE {} LOGIN PASSWORD {}').format(usuario, sql.Literal(AGENTE_DB_PASSWORD)))
            for comando in (
                'GRANT USAGE ON SCHEMA agente TO {}',
                'GRANT SELECT ON ALL TABLES IN SCHEMA agente TO {}',
                'ALTER ROLE {} SET default_transaction_read_only = on',
                "ALTER ROLE {} SET statement_timeout = '10s'",
                'ALTER ROLE {} SET search_path = agente',
            ):
                cursor.execute(sql.SQL(comando).format(usuario))
        conexao.commit()
    finally:
        conexao.close()
    print(f'Schema agente com {len(TABELAS_AGENTE)} views e usuário {AGENTE_DB_USER} prontos.')


if __name__ == '__main__':
    main()