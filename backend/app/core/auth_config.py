"""Segredos de autenticação e convite de cadastro, definidos pelo servidor."""
import os

from app.core import config as _config  # noqa: F401 (carrega o .env comum)
from app.core.security import _validar_segredo


JWT_SECRET = os.getenv('JWT_SECRET', '')
AUTH_INVITE_CODE = os.getenv('AUTH_INVITE_CODE', '').strip()

# Sem chave, os endpoints protegidos respondem 503; não há acesso anônimo ao portal.
if JWT_SECRET:
    _validar_segredo(JWT_SECRET)
