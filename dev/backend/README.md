# Backend

Projeto inicial em FastAPI. Requer Python 3.12 ou superior e uv.

## Executar em desenvolvimento

Dentro da pasta `backend`:

```bash
uv sync
uv run fastapi dev
```

O uv cria o ambiente virtual `.venv` e instala as dependências.
O servidor recarrega automaticamente quando o código muda.

- API: http://127.0.0.1:8000
- Swagger UI: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- Health check: http://127.0.0.1:8000/health

## Estrutura

```text
backend/
├── app/
│   ├── __init__.py
│   └── main.py
├── pyproject.toml
└── README.md
```

As rotas iniciais estão em `app/main.py`.
O arquivo `uv.lock` será gerado na primeira execução bem-sucedida de `uv sync`.

Referência: https://fastapi.tiangolo.com/fastapi-cli/
