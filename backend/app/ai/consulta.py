"""Ferramenta segura de consulta usada pelo agente (GENAI-6) e busca de valores reais (GENAI-8)."""
from datetime import date, datetime
from decimal import Decimal

import psycopg
from psycopg import errors

from app.ai.agent import COLUNAS_CATEGORICAS_PERMITIDAS
from app.ai.contratos import ErroConsulta, ResultadoConsulta, SQLBloqueado
from app.ai.validador import validar_sql
from app.db.agente import TABELAS_AGENTE, colunas_da_view
from app.db.session import obter_engine_agente

# Máximo de linhas que voltam para agente
MAX_LINHAS = 500

# Valor simples pra JSON
def _valor_simples(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    return valor

# Função principal
# Valida, roda com o usuário somente leitura do agente e retorna colunas, linhas e tabelas usadas.
def executar_consulta(sql: str) -> ResultadoConsulta:
    validado = validar_sql(sql)
    conexao = obter_engine_agente().raw_connection()
    try:
        with conexao.cursor() as cursor:
            # Cursor cru e sem parâmetros: um LIKE '%RECIFE%' não é confundido com placeholder.
            cursor.execute(validado.sql)
            colunas = [coluna.name for coluna in cursor.description]
            linhas = cursor.fetchmany(MAX_LINHAS + 1)
    except errors.InsufficientPrivilege as erro:
        raise SQLBloqueado('O assistente não tem acesso a esses dados.') from erro
    except errors.ReadOnlySqlTransaction as erro:
        raise SQLBloqueado('O assistente não pode alterar dados.') from erro
    except errors.QueryCanceled as erro:
        raise ErroConsulta('A consulta passou de 10 segundos. Use as tabelas agg_* ou filtre mais.') from erro
    except psycopg.Error as erro:
        raise ErroConsulta(f'Erro no SQL: {erro.diag.message_primary or type(erro).__name__}') from erro
    finally:
        conexao.rollback()
        conexao.close()
    return ResultadoConsulta(
        colunas=colunas,
        linhas=[[_valor_simples(v) for v in linha] for linha in linhas[:MAX_LINHAS]],
        n_linhas=min(len(linhas), MAX_LINHAS),
        truncado=len(linhas) > MAX_LINHAS,
        sql_executado=validado.sql,
        tabelas_usadas=validado.tabelas,
    )

# Troca a lista fixa por valores reais do banco, mas só pra colunas liberadas. Limita a 30 valores pra não travar o agente.
# Exemplo: antes de filtrar por Jaboatão, ele pergunta os valores de municipio e descobre que o certo é JABOATÃO DOS GUARARAPES
def valores_distintos(tabela: str, coluna: str) -> list[str]:
    tabela, coluna = tabela.strip().lower().removeprefix('agente.'), coluna.strip().lower()
    if coluna not in COLUNAS_CATEGORICAS_PERMITIDAS.get(tabela, set()):
        raise ValueError(f'Coluna {coluna!r} de {tabela!r} não está liberada para busca de valores.')
    # Se nomes já conferidos na lista acima, então podem ir direto no SQL.
    resultado = executar_consulta(
        f'SELECT DISTINCT {coluna} FROM {tabela} WHERE {coluna} IS NOT NULL ORDER BY 1 LIMIT 30')
    return [str(linha[0]) for linha in resultado.linhas]

# Quais colunas uma tabela tem
def descrever_tabela(tabela: str) -> str:
    nome = tabela.strip().lower().removeprefix('agente.').removeprefix('gold.')
    if nome not in TABELAS_AGENTE:
        return f'Tabela {tabela!r} não existe para o assistente. Disponíveis: {", ".join(TABELAS_AGENTE)}'
    return f'Tabela `{nome}`: colunas {", ".join(colunas_da_view(nome))}'