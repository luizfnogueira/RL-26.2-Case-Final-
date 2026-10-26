import os
from pathlib import Path

from dotenv import load_dotenv


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_FILE, override=False)

# Opt-in explicito; testes e ambientes antigos continuam podendo usar o seed.
GOLD_SOURCE = os.getenv('GOLD_SOURCE', 'seed')
if GOLD_SOURCE not in {'seed', 'real'}:
    raise ValueError('GOLD_SOURCE deve ser seed ou real')

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://vgrid:vgrid@localhost:5432/vgrid360",
)

# Assistente de IA (POST /ia). mock = respostas simuladas, sem chamar o agente da Equipe 3.
IA_MODO = os.getenv("IA_MODO", "mock")
if IA_MODO not in ("mock", "real"):
    raise RuntimeError(f"IA_MODO inválido: {IA_MODO!r}. Use mock ou real.")
IA_TIMEOUT_S = float(os.getenv("IA_TIMEOUT_S", "30"))
IA_AGENTE_URL = os.getenv("IA_AGENTE_URL", "")
IA_API_KEY = os.getenv("IA_API_KEY", "")  # só no .env: nunca no código, na resposta ou no front
# Módulo de insight da Equipe 3 (POST /ia/insight da receita). Vazio no modo real = texto alternativo.
IA_INSIGHT_URL = os.getenv("IA_INSIGHT_URL", "")
