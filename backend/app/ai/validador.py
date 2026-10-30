"""Validador de SQL antes da execução (A2, GENAI-6): só um SELECT, só nas views do agente."""
import re
from dataclasses import dataclass

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError

from app.ai.contratos import ErroConsulta, SQLBloqueado
from app.db.agente import TABELAS_AGENTE

# Limite padrão de linhas devolvidas por consulta
LIMITE_PADRAO = 1000

# Colunas que o assistente não pode ver, mesmo que estejam na view.
COLUNAS_PESSOAIS = {'cpf_cnpj', 'nome_titular', 'logradouro', 'cep', 'latitude', 'longitude'}
# getattr porque o nome de algumas classes muda entre versões do sqlglot

# Comandos proibidos
NOS_PROIBIDOS = tuple(getattr(exp, nome) for nome in (
    'Insert', 'Update', 'Delete', 'Drop', 'Create', 'Alter', 'AlterTable', 'Merge', 'Command',
    'Copy', 'Grant', 'TruncateTable', 'Set', 'Into', 'Lock', 'Transaction', 'Commit', 'Rollback',
) if hasattr(exp, nome))

# Funções proibidas
FUNCOES_PROIBIDAS = re.compile(
    r'\b(pg_sleep\w*|pg_read_\w+|pg_ls_dir|pg_stat_file|lo_\w+|dblink\w*|set_config|current_setting'
    r'|pg_terminate_backend|pg_cancel_backend|query_to_xml\w*)\s*\(', re.IGNORECASE)


@dataclass
class SQLValidado:
    sql: str
    tabelas: list[str]

# Valida o SQL e retorna um objeto SQLValidado
def validar_sql(sql: str) -> SQLValidado:
    if FUNCOES_PROIBIDAS.search(sql):
        raise SQLBloqueado('A consulta usa uma função do banco que não é permitida.')
    
    try:
        comandos = [c for c in sqlglot.parse(sql, read='postgres') if c is not None]
    except ParseError as erro:
        raise ErroConsulta(f'SQL inválido: {str(erro).splitlines()[0][:200]}') from erro
    
    if len(comandos) != 1:
        raise SQLBloqueado('Só uma consulta por vez é permitida.')
    arvore = comandos[0]
    
    if not isinstance(arvore, (exp.Select, exp.Union, exp.Except, exp.Intersect)):
        raise SQLBloqueado('Só consultas SELECT são permitidas.')
    
    if arvore.find(*NOS_PROIBIDOS):
        raise SQLBloqueado('A consulta tenta alterar dados ou o banco.')
    
    ctes = {cte.alias_or_name.lower() for cte in arvore.find_all(exp.CTE)}
    tabelas = set()
    
    for tabela in arvore.find_all(exp.Table):
        nome, schema = tabela.name.lower(), (tabela.db or '').lower()
        
        if not schema and nome in ctes:
            continue
        
        if tabela.catalog or schema not in ('', 'agente') or nome not in TABELAS_AGENTE:
            raise SQLBloqueado(f'Tabela não liberada para o assistente: {tabela.sql()}')
        
        tabelas.add(nome)
    
    if any(col.name.lower() in COLUNAS_PESSOAIS for col in arvore.find_all(exp.Column)):
        raise SQLBloqueado('A consulta pede dados pessoais, que o assistente não acessa.')
    
    if not arvore.args.get('limit'):
        arvore = arvore.limit(LIMITE_PADRAO)
    
    return SQLValidado(sql=arvore.sql(dialect='postgres'), tabelas=sorted(tabelas))