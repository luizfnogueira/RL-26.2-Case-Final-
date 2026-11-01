"""Cria somente portal.usuarios, sem recarregar a Gold ou as ordens."""
from sqlalchemy import text

from app.db.session import engine
from app.models.usuario import Usuario


def criar_tabela(bind=engine):
    with bind.begin() as conn:
        conn.execute(text('CREATE SCHEMA IF NOT EXISTS portal'))
        Usuario.__table__.create(conn, checkfirst=True)
        # create(checkfirst=True) preserva tabelas existentes; esta migração acrescenta
        # somente o campo de apresentação, sem alterar contas, senhas ou permissões.
        if conn.dialect.name == 'postgresql':
            conn.execute(text('ALTER TABLE portal.usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(80)'))


if __name__ == '__main__':
    criar_tabela()
    print('Tabela de usuários pronta.')
