"""Configuração de AUTH-b; habilitação explícita enquanto o fluxo está em revisão."""
import os

from app.core import config as _config  # noqa: F401 (carrega o .env comum)
from app.core.security import _validar_segredo


def validar_habilitacao(valor: str) -> bool:
    if valor.lower() not in {'true', 'false'}:
        raise ValueError('AUTH_ENABLED deve ser true ou false.')
    return valor.lower() == 'true'


AUTH_ENABLED = validar_habilitacao(os.getenv('AUTH_ENABLED', 'false'))
JWT_SECRET = os.getenv('JWT_SECRET', '')

# Uma instalação protegida não pode iniciar sem uma chave válida.
if AUTH_ENABLED or JWT_SECRET:
    _validar_segredo(JWT_SECRET)
