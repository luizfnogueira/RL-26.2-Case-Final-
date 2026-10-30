"""Persistência e unicidade em PostgreSQL descartável; nunca usa o banco do portal."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.security import gerar_hash_senha
from app.db.init_auth import criar_tabela
from app.db.seed import gerar, recarregar_gold
from app.models.usuario import Usuario
from app.repositories import auth_repository as repo
from tests.test_auth_api import SENHA, autenticar, cadastro, client  # noqa: F401 (fixture)
from tests.test_gold_import import pg  # noqa: F401 (banco descartável)


@pytest.fixture
def engine(pg):
    criar_tabela(pg)
    yield pg


def test_cadastro_login_me_persistem_em_sessoes_distintas(client, engine):
    sessao = autenticar(client)
    with Session(engine) as db:
        usuario = db.scalar(select(Usuario))
        assert usuario.id == sessao['usuario']['id']
        assert usuario.senha_hash.startswith('$argon2id$')
        assert usuario.perfil == 'usuario'
    assert client.get('/auth/me', headers={'Authorization': 'Bearer ' + sessao['access_token']}).json() == sessao['usuario']
    assert client.post('/auth/register', json=cadastro()).status_code == 409


def test_banco_impede_emails_duplicados_em_cadastros_concorrentes(engine):
    barreira = Barrier(2)
    senha_hash = gerar_hash_senha(SENHA)

    def criar():
        with Session(engine) as db:
            barreira.wait(timeout=10)
            try:
                repo.criar(db, nome='Conta concorrente', email='concorrente@example.com', senha_hash=senha_hash)
                return 'criado'
            except repo.EmailJaCadastradoError:
                return 'duplicado'

    with ThreadPoolExecutor(max_workers=2) as executor:
        resultados = list(executor.map(lambda _: criar(), range(2)))
    assert sorted(resultados) == ['criado', 'duplicado']
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Usuario)) == 1


def test_inicializacao_e_recarga_gold_preservam_usuarios(client, engine):
    sessao = autenticar(client)
    with engine.connect() as conn:
        antes = conn.execute(text('SELECT id, email, senha_hash, perfil FROM portal.usuarios')).all()
    criar_tabela(engine)
    recarregar_gold(engine, gerar(n_ucs=10, semente=30))
    with engine.connect() as conn:
        depois = conn.execute(text('SELECT id, email, senha_hash, perfil FROM portal.usuarios')).all()
    assert antes == depois
    assert client.get('/auth/me', headers={'Authorization': 'Bearer ' + sessao['access_token']}).status_code == 200
