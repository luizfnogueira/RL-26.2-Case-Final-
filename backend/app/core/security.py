"""Criptografia de AUTH-b. Configuração e acesso ao banco ficam nas camadas chamadoras.

Na integração, o chamador deve fornecer o JWT_SECRET vindo do ambiente.
Nenhum segredo padrão é criado por este módulo.
"""
from datetime import datetime, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from pydantic import ValidationError

from app.schemas.auth import ClaimsToken

VALIDADE_TOKEN_SEGUNDOS = 60 * 60
_hasher = PasswordHasher()


class TokenInvalidoError(ValueError):
    """Token ausente, expirado, adulterado ou fora do formato esperado."""


def gerar_hash_senha(senha: str) -> str:
    if not isinstance(senha, str) or len(senha) < 8:
        raise ValueError('A senha deve ter pelo menos 8 caracteres.')
    # Não remover espaços, normalizar Unicode nem truncar a senha.
    return _hasher.hash(senha)


def verificar_senha(senha: str, senha_hash: str) -> bool:
    if not isinstance(senha, str) or not isinstance(senha_hash, str):
        return False
    try:
        return _hasher.verify(senha_hash, senha)
    except (VerificationError, InvalidHashError):
        return False


def _validar_segredo(segredo: str) -> None:
    if not isinstance(segredo, str) or len(segredo.encode('utf-8')) < 32 or not segredo.strip():
        raise ValueError('JWT_SECRET deve conter pelo menos 32 bytes e ser gerado aleatoriamente.')


def criar_token(id_usuario: str, perfil: str, *, segredo: str) -> str:
    _validar_segredo(segredo)
    emitido_em = int(datetime.now(timezone.utc).timestamp())
    claims = ClaimsToken(sub=id_usuario, perfil=perfil, iat=emitido_em,
                         exp=emitido_em + VALIDADE_TOKEN_SEGUNDOS)
    return jwt.encode(claims.model_dump(), segredo, algorithm='HS256')


def ler_token(token: str, *, segredo: str) -> ClaimsToken:
    _validar_segredo(segredo)
    try:
        # O algoritmo aceito é fixo; nunca vem do header controlado pelo cliente.
        payload = jwt.decode(token, segredo, algorithms=['HS256'], options={
            'require': ['sub', 'perfil', 'iat', 'exp'],
        })
        return ClaimsToken.model_validate(payload)
    except (jwt.InvalidTokenError, ValidationError):
        # Não repassar token, claims ou detalhes da biblioteca para respostas/logs.
        raise TokenInvalidoError('Sessão inválida ou expirada.') from None
