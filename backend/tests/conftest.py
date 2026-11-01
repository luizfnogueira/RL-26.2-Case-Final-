"""Testes de negócio isolam autenticação; test_auth_* exercitam a proteção real.

O bypass existe somente no processo pytest, via injeção de dependência, para manter
as suítes de domínio independentes de contas e JWTs. A aplicação não tem flag de bypass.
"""
import pytest


@pytest.fixture(autouse=True)
def autenticar_suites_de_negocio(request, monkeypatch):
    if request.module.__name__.split('.')[-1].startswith('test_auth_'):
        return
    from app.core.auth import proteger_rotas
    from app.main import app
    monkeypatch.setitem(app.dependency_overrides, proteger_rotas, lambda: None)
