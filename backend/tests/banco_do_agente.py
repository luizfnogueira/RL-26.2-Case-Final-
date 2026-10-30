"""Testes que usam o usuário do agente e a Gold real (GENAI-5, 6, 21 e 26).

Só rodam quando o banco está pronto de verdade. Ter AGENTE_DB_PASSWORD no .env não basta: sem o
usuário criado (python -m app.db.agente) ou com a Gold do seed, eles falhariam por motivo de ambiente.
"""
from functools import lru_cache

import pytest
from sqlalchemy import text

from app.core import config

COMO_PREPARAR = ('precisa da Gold real e do usuário do agente: carregue a Gold real, preencha '
                 'AGENTE_DB_PASSWORD no .env e rode python -m app.db.agente')


@lru_cache(maxsize=1)
def gold_real_com_agente() -> bool:
    if not config.AGENTE_DB_PASSWORD:
        return False
    from app.db.session import engine, obter_engine_agente
    try:
        # Só a carga da Gold real cria gold._carga_metadata; o seed não cria
        with engine.connect() as conexao:
            if conexao.execute(text("SELECT to_regclass('gold._carga_metadata')")).scalar() is None:
                return False
        # O usuário existe, a senha confere e as views do schema agente estão lá
        with obter_engine_agente().connect() as conexao:
            conexao.execute(text('SELECT 1 FROM dim_mes LIMIT 1'))
    except Exception:
        return False
    return True


precisa_da_gold_real = pytest.mark.skipif(not gold_real_com_agente(), reason=COMO_PREPARAR)