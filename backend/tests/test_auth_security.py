"""Primeira etapa de AUTH-b: criptografia e claims, sem banco e sem rotas."""
from datetime import datetime, timezone

import jwt
import pytest
from pydantic import ValidationError

from app.core.security import (
    TokenInvalidoError, criar_token, gerar_hash_senha, ler_token, verificar_senha,
)
from app.schemas.auth import ClaimsToken

# Exclusivamente sintético; não é configuração de produção.
SEGREDO = 'auth-b-segredo-sintetico-de-teste-2026'


@pytest.fixture(scope='module')
def senha_hash():
    return gerar_hash_senha('  Senha de teste ç!  ')


def test_hash_argon2id_com_salt_aleatorio(senha_hash):
    assert senha_hash.startswith('$argon2id$')
    assert senha_hash != gerar_hash_senha('  Senha de teste ç!  ')
    assert 'Senha de teste' not in senha_hash


def test_verifica_senha_sem_remover_espacos(senha_hash):
    assert verificar_senha('  Senha de teste ç!  ', senha_hash)
    assert not verificar_senha('Senha de teste ç!', senha_hash)
    assert not verificar_senha('outra senha', senha_hash)


@pytest.mark.parametrize('senha', ['', '1234567', None])
def test_senha_curta_rejeitada_sem_expor_valor(senha):
    with pytest.raises(ValueError, match='pelo menos 8 caracteres'):
        gerar_hash_senha(senha)


def test_aceita_senha_de_oito_caracteres():
    assert verificar_senha('12345678', gerar_hash_senha('12345678'))


@pytest.mark.parametrize('senha_hash', ['', 'hash-invalido', None])
def test_hash_invalido_nao_autentica(senha_hash):
    assert not verificar_senha('senha de teste', senha_hash)


def test_jwt_hs256_com_identidade_perfil_e_sessenta_minutos():
    antes = int(datetime.now(timezone.utc).timestamp())
    token = criar_token('usuario-sintetico', 'administrador', segredo=SEGREDO)
    claims = ler_token(token, segredo=SEGREDO)
    assert jwt.get_unverified_header(token)['alg'] == 'HS256'
    assert claims.sub == 'usuario-sintetico'
    assert claims.perfil == 'administrador'
    assert antes <= claims.iat <= int(datetime.now(timezone.utc).timestamp())
    assert claims.exp - claims.iat == 3600


def payload_valido():
    agora = int(datetime.now(timezone.utc).timestamp())
    return {'sub': 'usuario-sintetico', 'perfil': 'administrador', 'iat': agora, 'exp': agora + 3600}


def test_jwt_expirado():
    payload = payload_valido()
    payload.update(iat=payload['iat'] - 7200, exp=payload['iat'] - 3600)
    with pytest.raises(TokenInvalidoError, match='Sessão inválida ou expirada'):
        ler_token(jwt.encode(payload, SEGREDO, algorithm='HS256'), segredo=SEGREDO)


def test_jwt_adulterado_e_assinado_com_outra_chave():
    token = criar_token('usuario-sintetico', 'administrador', segredo=SEGREDO)
    assinatura = token.rsplit('.', 1)[1]
    adulterado = token.rsplit('.', 1)[0] + '.' + ('A' if assinatura[0] != 'A' else 'B') + assinatura[1:]
    for invalido in (adulterado, jwt.encode(payload_valido(), 'outra-chave-sintetica-com-32-bytes', algorithm='HS256')):
        with pytest.raises(TokenInvalidoError) as erro:
            ler_token(invalido, segredo=SEGREDO)
        assert invalido not in str(erro.value)
        assert SEGREDO not in str(erro.value)


@pytest.mark.parametrize('algoritmo', ['HS384', 'none'])
def test_recusa_outro_algoritmo_mesmo_com_assinatura_valida(algoritmo):
    token = jwt.encode(payload_valido(), SEGREDO * 2 if algoritmo != 'none' else None, algorithm=algoritmo)
    with pytest.raises(TokenInvalidoError):
        ler_token(token, segredo=SEGREDO)


@pytest.mark.parametrize('campo', ['sub', 'perfil', 'iat', 'exp'])
def test_recusa_claim_obrigatorio_ausente(campo):
    payload = payload_valido()
    del payload[campo]
    with pytest.raises(TokenInvalidoError):
        ler_token(jwt.encode(payload, SEGREDO, algorithm='HS256'), segredo=SEGREDO)


@pytest.mark.parametrize('campo,valor', [
    ('sub', ''), ('sub', '  '), ('sub', 123), ('perfil', ''), ('perfil', '  '),
    ('perfil', ['administrador']), ('iat', True), ('exp', '9999999999'),
])
def test_recusa_claims_inconsistentes(campo, valor):
    payload = {**payload_valido(), campo: valor}
    with pytest.raises(TokenInvalidoError):
        ler_token(jwt.encode(payload, SEGREDO, algorithm='HS256'), segredo=SEGREDO)


def test_schema_recusa_expiracao_anterior_a_emissao():
    payload = payload_valido()
    payload['exp'] = payload['iat']
    with pytest.raises(ValidationError):
        ClaimsToken.model_validate(payload)


def test_recusa_emissao_futura():
    payload = payload_valido()
    payload.update(iat=payload['iat'] + 7200, exp=payload['exp'] + 7200)
    with pytest.raises(TokenInvalidoError):
        ler_token(jwt.encode(payload, SEGREDO, algorithm='HS256'), segredo=SEGREDO)


@pytest.mark.parametrize('token', ['', 'invalido', None])
def test_token_malformado(token):
    with pytest.raises(TokenInvalidoError):
        ler_token(token, segredo=SEGREDO)


@pytest.mark.parametrize('segredo', ['', 'curto', ' ' * 32, None])
def test_segredo_ausente_ou_curto_bloqueia_emissao_e_leitura(segredo):
    with pytest.raises(ValueError, match='JWT_SECRET'):
        criar_token('usuario-sintetico', 'administrador', segredo=segredo)
    with pytest.raises(ValueError, match='JWT_SECRET'):
        ler_token('token-sintetico', segredo=segredo)
