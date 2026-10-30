"""Seed explícito: AUTH_ADMIN_NOME, AUTH_ADMIN_EMAIL e AUTH_ADMIN_PASSWORD no ambiente.

Não cria senha padrão, não sobrescreve contas e não promove usuários existentes.
Executar: python -m app.db.seed_auth
"""
import os

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.security import gerar_hash_senha
from app.db.init_auth import criar_tabela
from app.db.session import engine
from app.repositories import auth_repository as repo
from app.schemas.auth import CadastroAuth


def criar_administrador(db: Session, *, nome: str, email: str, senha: str):
    entrada = CadastroAuth(nome=nome, email=email, senha=senha)
    existente = repo.por_email(db, str(entrada.email))
    if existente:
        if existente.perfil != 'administrador' or not existente.ativo:
            raise ValueError('O e-mail informado já pertence a outra conta; seed não altera contas.')
        return False
    repo.criar(db, nome=entrada.nome, email=str(entrada.email),
               senha_hash=gerar_hash_senha(entrada.senha.get_secret_value()), perfil='administrador')
    return True


def main():
    nome = os.getenv('AUTH_ADMIN_NOME', 'Administrador')
    email = os.getenv('AUTH_ADMIN_EMAIL', '')
    senha = os.getenv('AUTH_ADMIN_PASSWORD', '')
    # Validação antes de qualquer escrita; mensagens nunca incluem credenciais.
    try:
        CadastroAuth(nome=nome, email=email, senha=senha)
    except ValidationError:
        raise SystemExit('Defina AUTH_ADMIN_NOME, AUTH_ADMIN_EMAIL e AUTH_ADMIN_PASSWORD válidos.') from None
    criar_tabela()
    with Session(engine) as db:
        criado = criar_administrador(db, nome=nome, email=email, senha=senha)
    print('Administrador criado.' if criado else 'Administrador já existe; nenhuma alteração.')


if __name__ == '__main__':
    main()
