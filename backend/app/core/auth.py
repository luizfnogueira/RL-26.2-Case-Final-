from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core import auth_config
from app.core.security import TokenInvalidoError, ler_token
from app.db.session import get_db
from app.models.usuario import Usuario
from app.repositories.auth_repository import por_id
from app.services.auth_service import exigir_configuracao

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credencial: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> Usuario:
    exigir_configuracao()
    erro = HTTPException(401, detail={
        'codigo': 'NAO_AUTENTICADO', 'mensagem': 'Sessão inválida ou expirada.'},
        headers={'WWW-Authenticate': 'Bearer'})
    if credencial is None:
        raise erro
    try:
        claims = ler_token(credencial.credentials, segredo=auth_config.JWT_SECRET)
        UUID(claims.sub)
    except (TokenInvalidoError, ValueError):
        raise erro from None
    usuario = por_id(db, claims.sub)
    # A conta e o perfil atuais são conferidos no banco em cada requisição.
    if usuario is None or not usuario.ativo or usuario.perfil != claims.perfil:
        raise erro
    return usuario


def proteger_rotas(
    credencial: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    if auth_config.AUTH_ENABLED:
        get_current_user(credencial, db)
