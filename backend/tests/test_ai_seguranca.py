"""Segurança do acesso do agente à Gold (A1 e A2)."""
import pytest
from psycopg import errors

from app.ai.contratos import SQLBloqueado
from app.ai.validador import validar_sql
from app.core import config

ATAQUES = [
    'DROP TABLE dim_uc',
    'SELECT 1; DELETE FROM dim_uc',
    'WITH d AS (DELETE FROM dim_uc RETURNING *) SELECT * FROM d',
    'SELECT * FROM portal.ordens_inspecao',
    'SELECT * FROM gold.dim_uc',
    'SELECT cpf_cnpj FROM dim_uc',
    'SELECT pg_sleep(20)',
    'SELECT * INTO nova FROM dim_uc',
    'SELECT * FROM information_schema.tables',
    'SELECT * FROM dim_uc /* x */; UPDATE dim_uc SET bairro = 1',
]

CONSULTAS_NORMAIS = [
    'SELECT municipio, SUM(receita_total) FROM agg_receita_mensal GROUP BY 1',
    "WITH x AS (SELECT * FROM agente.agg_kpis_mensal) SELECT * FROM x WHERE periodo = 'P2'",
    'SELECT bairro FROM dim_uc UNION SELECT bairro FROM tb_fila_perdas',
    "SELECT bairro FROM dim_uc WHERE bairro LIKE '%BOA%'",
]

# Testes de segurança do validador de SQL
@pytest.mark.parametrize('sql', ATAQUES)
def test_validador_bloqueia_ataques(sql):
    with pytest.raises(SQLBloqueado):
        validar_sql(sql)

# Testes de segurança do banco de dados do agente (GENAI-5)
@pytest.mark.parametrize('sql', CONSULTAS_NORMAIS)
def test_validador_aceita_consultas_normais(sql):
    assert 'LIMIT' in validar_sql(sql).sql.upper()

precisa_do_banco = pytest.mark.skipif(
    not config.AGENTE_DB_PASSWORD, reason='precisa da Gold carregada e do usuário do agente')

# Testa que o banco do agente recusa comandos de escrita mesmo sem passar pelo validador.
@precisa_do_banco
@pytest.mark.parametrize('comando', [
    'UPDATE agente.dim_mes SET ano = 0',
    'SELECT * FROM gold.dim_uc LIMIT 1',
    'SELECT * FROM portal.ordens_inspecao LIMIT 1',
])
def test_banco_recusa_mesmo_sem_validador(comando):
    from app.db.session import obter_engine_agente
    conexao = obter_engine_agente().raw_connection()
    try:
        with pytest.raises((errors.InsufficientPrivilege, errors.ReadOnlySqlTransaction)):
            with conexao.cursor() as cursor:
                cursor.execute(comando)
    finally:
        conexao.rollback()
        conexao.close()

# Testa que o agente consegue fazer consultas normais e pegar valores distintos de colunas categóricas.
@precisa_do_banco
def test_consulta_normal_e_valores_reais():
    from app.ai.consulta import executar_consulta, valores_distintos
    resultado = executar_consulta("SELECT municipio FROM dim_uc WHERE municipio LIKE '%RECIFE%' LIMIT 1")
    assert resultado.linhas == [['RECIFE']]
    assert len(valores_distintos('dim_uc', 'classe')) == 5