# RL-26.2-Case-Final-

## Backend

Banco de dados: **PostgreSQL 16+**. A Gold fica no schema `gold` e as ordens do portal no schema `portal`; a recarga da Gold nunca toca no `portal`.

### Pré-requisitos

- Python 3.12+
- Docker com Docker Compose
  - Fedora: `sudo dnf install docker-cli docker-compose moby-engine && sudo systemctl enable --now docker && sudo usermod -aG docker $USER` (saia e entre de novo na sessão)
  - Ubuntu/Debian: `sudo apt install docker.io docker-compose-v2 && sudo usermod -aG docker $USER` (saia e entre de novo na sessão)
  - Windows e macOS: Docker Desktop em docs.docker.com/get-docker

### Instalação

```bash
cd backend
cp .env.example .env             # defina POSTGRES_PASSWORD (as credenciais ficam só no .env)
docker compose up -d             # sobe o PostgreSQL 16
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.db.seed            # carrega os dados fictícios da Gold
```

Se já houver um PostgreSQL usando a porta 5432 na máquina, pare-o ou troque `POSTGRES_PORT` no `.env`.

### Rodar

```bash
uvicorn app.main:app --reload
```

Documentação da API em http://localhost:8000/docs.

Para parar o banco: `docker compose stop` (os dados ficam no volume `postgres_dados`). Para apagar tudo e recomeçar: `docker compose down -v`.

### Testes

```bash
pytest
```

Para incluir o teste de recarga no banco, defina `TEST_DATABASE_URL` com um banco descartável (ex.: `postgresql+psycopg://vgrid:<senha>@localhost:5432/vgrid360_teste`).


## Frontend

React + TypeScript (Vite) + Tailwind CSS, com a identidade visual FILO (tokens em `frontend/src/index.css`, espelhando as variáveis do Figma).

### Pré-requisitos

- Node.js 22+

### Instalação e execução

```bash
cd frontend
npm install
cp .env.example .env             # Windows: copy .env.example .env
npm run dev
```

O portal abre em http://localhost:5173.

### Variáveis de ambiente (`frontend/.env`)

| Variável         | Padrão                  | Uso                                                              |
| ---------------- | ----------------------- | ---------------------------------------------------------------- |
| `VITE_API_URL`   | `http://localhost:8000` | URL base da API FastAPI                                          |
| `VITE_USE_MOCKS` | `true`                  | `true`: usa mocks rotulados como fictícios e dispensa o backend  |

### Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm run format` · `npm run format:check`

### Estrutura (`frontend/src`)

`layouts/` (menu, cabeçalho, rodapé, botão da IA) · `pages/` (uma por tela) · `components/` (por assunto) · `hooks/` · `services/` (cliente HTTP e `env.ts`) · `types/` · `data/` (mocks) · `utils/`.

Rotas: `/painel`, `/receita`, `/unidades` e `/unidades/:id`, `/perdas/fila`, `/perdas/ordens`, `/operacao`, `/assistente`.
