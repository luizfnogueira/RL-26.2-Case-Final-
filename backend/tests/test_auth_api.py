"""Fluxo HTTP de AUTH-b, isolado da Gold e sem credenciais reais."""
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core import auth_config
from app.core.security import criar_token, verificar_senha
from app.db.seed_auth import criar_administrador
from app.db.session import get_db
from app.main import app
from app.models.usuario import Usuario

SEGREDO = 'somente-testes-auth-b-segredo-de-32-bytes'
SENHA = '  Minha senha de teste!  '


def cadastro(**alteracoes):
    return {'nome': 'Artur Teste', 'email': 'artur@example.com', 'senha': SENHA, **alteracoes}


@pytest.fixture
def engine():
    db_engine = create_engine('sqlite://', connect_args={'check_same_thread': False},
                              poolclass=StaticPool, execution_options={'schema_translate_map': {'portal': None}})
    Usuario.__table__.create(db_engine)
    yield db_engine
    db_engine.dispose()


@pytest.fixture
def client(engine, monkeypatch):
    monkeypatch.setattr(auth_config, 'AUTH_ENABLED', True)
    monkeypatch.setattr(auth_config, 'JWT_SECRET', SEGREDO)

    def banco():
        with Session(engine, expire_on_commit=False) as db:
            yield db

    anteriores = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = banco
    with TestClient(app) as cliente:
        yield cliente
    app.dependency_overrides.clear()
    app.dependency_overrides.update(anteriores)


def autenticar(client):
    assert client.post('/auth/register', json=cadastro()).status_code == 201
    resposta = client.post('/auth/login', json={'email': 'artur@example.com', 'senha': SENHA})
    assert resposta.status_code == 200
    return resposta.json()


def test_cadastro_sem_convite_login_me_e_rota_protegida(client, engine):
    criado = client.post('/auth/register', json={**cadastro(), 'email': ' ARTUR@EXAMPLE.COM '})
    assert criado.status_code == 201
    usuario = criado.json()
    assert set(usuario) == {'id', 'nome', 'email', 'perfil'}
    assert usuario['email'] == 'artur@example.com'
    assert usuario['perfil'] == 'usuario'
    with Session(engine) as db:
        conta = db.get(Usuario, usuario['id'])
        assert conta.senha_hash.startswith('$argon2id$')
        assert verificar_senha(SENHA, conta.senha_hash)
        assert not verificar_senha(SENHA.strip(), conta.senha_hash)
    login = client.post('/auth/login', json={'email': 'ARTUR@example.com', 'senha': SENHA})
    assert login.status_code == 200
    assert login.headers['cache-control'] == 'no-store'
    sessao = login.json()
    assert set(sessao) == {'access_token', 'token_type', 'usuario'}
    assert sessao['token_type'] == 'bearer'
    assert sessao['usuario'] == usuario
    claims = jwt.decode(sessao['access_token'], SEGREDO, algorithms=['HS256'])
    assert claims['exp'] - claims['iat'] == 3600
    headers = {'Authorization': 'Bearer ' + sessao['access_token']}
    assert client.get('/auth/me', headers=headers).json() == usuario
    assert client.get('/', headers=headers).status_code == 200
    assert client.get('/').status_code == 401
    assert client.get('/health').status_code == 200


def test_email_duplicado_normalizado(client):
    autenticar(client)
    resposta = client.post('/auth/register', json={**cadastro(), 'email': ' Artur@Example.com '})
    assert resposta.status_code == 409
    assert resposta.json()['codigo'] == 'EMAIL_JA_CADASTRADO'


@pytest.mark.parametrize('campo,valor', [
    ('convite', 'campo-removido'), ('perfil', 'administrador'), ('ativo', True), ('id', str(uuid4())),
    ('nome', ' '), ('nome', 'x' * 121), ('email', 'invalido'), ('senha', 'curta'), ('senha', 'x' * 129),
])
def test_recusa_escalada_de_perfil_e_entradas_invalidas(client, campo, valor):
    resposta = client.post('/auth/register', json={**cadastro(), campo: valor})
    assert resposta.status_code == 422
    assert resposta.json()['codigo'] == 'DADOS_INVALIDOS'
    assert SENHA not in resposta.text



def test_sem_segredo_nao_cria_conta(client, engine, monkeypatch):
    monkeypatch.setattr(auth_config, 'JWT_SECRET', '')
    assert client.post('/auth/register', json=cadastro()).status_code == 503
    assert client.post('/auth/login', json={'email': 'a@example.com', 'senha': SENHA}).status_code == 503
    with Session(engine) as db:
        assert db.scalar(select(Usuario)) is None


def test_login_invalido_generico_e_conta_desativada(client, engine):
    sessao = autenticar(client)
    errado = client.post('/auth/login', json={'email': 'artur@example.com', 'senha': 'errada'})
    inexistente = client.post('/auth/login', json={'email': 'outro@example.com', 'senha': SENHA})
    assert errado.status_code == inexistente.status_code == 401
    assert errado.json() == inexistente.json()
    assert errado.headers['www-authenticate'] == 'Bearer'
    with Session(engine) as db:
        db.get(Usuario, sessao['usuario']['id']).ativo = False
        db.commit()
    desativado = client.post('/auth/login', json={'email': 'artur@example.com', 'senha': SENHA})
    assert desativado.status_code == 401 and desativado.json() == errado.json()
    assert client.get('/auth/me', headers={'Authorization': 'Bearer ' + sessao['access_token']}).status_code == 401


@pytest.mark.parametrize('tipo', ['expirado', 'adulterado', 'sem_assinatura', 'inexistente', 'perfil_alterado'])
def test_token_invalido_nao_abre_sessao(client, engine, tipo):
    sessao = autenticar(client)
    token = sessao['access_token']
    payload = jwt.decode(token, SEGREDO, algorithms=['HS256'])
    if tipo == 'expirado':
        payload.update(iat=1, exp=2)
        token = jwt.encode(payload, SEGREDO, algorithm='HS256')
    elif tipo == 'adulterado':
        token = jwt.encode(payload, 'outra-chave-de-teste-com-32-caracteres', algorithm='HS256')
    elif tipo == 'sem_assinatura':
        token = jwt.encode(payload, None, algorithm='none')
    elif tipo == 'inexistente':
        token = criar_token(str(uuid4()), 'usuario', segredo=SEGREDO)
    else:
        with Session(engine) as db:
            db.get(Usuario, sessao['usuario']['id']).perfil = 'administrador'
            db.commit()
    resposta = client.get('/auth/me', headers={'Authorization': 'Bearer ' + token})
    assert resposta.status_code == 401
    assert resposta.json()['codigo'] == 'NAO_AUTENTICADO'


@pytest.mark.parametrize('metodo,caminho', [
    ('GET', '/dashboard'), ('GET', '/dashboard/comparacao'), ('GET', '/filtros'),
    ('GET', '/operacao'), ('GET', '/unidades'), ('GET', '/unidades/UC1'),
    ('GET', '/inspecoes'), ('POST', '/inspecoes'), ('PATCH', '/inspecoes/1'),
    ('POST', '/ia'), ('POST', '/ia/insight'),
])
def test_protecao_central_cobre_rotas_da_equipe(client, metodo, caminho):
    assert client.request(metodo, caminho).status_code == 401


def test_flag_desligada_preserva_portal_mas_me_exige_token(client, monkeypatch):
    monkeypatch.setattr(auth_config, 'AUTH_ENABLED', False)
    assert client.get('/').status_code == 200
    assert client.get('/auth/me').status_code == 401


def test_preflight_permite_authorization_na_origem_do_front(client):
    resposta = client.options('/auth/login', headers={
        'Origin': 'http://127.0.0.1:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
    })
    assert resposta.status_code == 200
    assert resposta.headers['access-control-allow-origin'] == 'http://127.0.0.1:5173'
    assert 'Authorization' in resposta.headers['access-control-allow-headers']


def test_seed_administrador_idempotente_sem_redefinir_senha(engine):
    with Session(engine) as db:
        assert criar_administrador(db, nome='Admin Teste', email='admin@example.com', senha=SENHA)
        assert not criar_administrador(db, nome='Outro', email='ADMIN@example.com', senha='Outra senha!')
        admin = db.scalar(select(Usuario))
        assert admin.perfil == 'administrador'
        assert verificar_senha(SENHA, admin.senha_hash)


def test_seed_nao_promove_usuario_existente(client, engine):
    autenticar(client)
    with Session(engine) as db:
        with pytest.raises(ValueError, match='seed não altera contas'):
            criar_administrador(db, nome='Admin', email='artur@example.com', senha=SENHA)


@pytest.mark.parametrize('valor', ['yes', '0', '', 'habilitado'])
def test_flag_invalida_nao_desliga_protecao_silenciosamente(valor):
    with pytest.raises(ValueError, match='AUTH_ENABLED'):
        auth_config.validar_habilitacao(valor)
