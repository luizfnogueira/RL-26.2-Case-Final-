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
