# RL-26.2-Case-Final-

## Backend

Banco de dados: **PostgreSQL 16+**. A Gold fica no schema `gold` e as ordens do portal no schema `portal`; a recarga da Gold nunca toca no `portal`.

### Pré-requisitos

- Docker com Docker Compose
  - Fedora: `sudo dnf install docker-cli docker-compose moby-engine && sudo systemctl enable --now docker && sudo usermod -aG docker $USER` (saia e entre de novo na sessão)
  - Ubuntu/Debian: `sudo apt install docker.io docker-compose-v2 && sudo usermod -aG docker $USER` (saia e entre de novo na sessão)
  - Windows e macOS: Docker Desktop em docs.docker.com/get-docker

### Instalação e execução

```bash
cd backend
cp .env.example .env                              # defina POSTGRES_PASSWORD (as credenciais ficam só no .env)
docker compose up -d --build --wait               # sobe o PostgreSQL e a API e espera ficarem prontos
docker compose exec api python -m app.db.seed     # carrega os dados fictícios da Gold
```

Documentação da API em http://localhost:8000/docs. O código em `app/` é montado no container: ao salvar, a API recarrega sozinha.

Se as portas 5432 ou 8000 já estiverem em uso, troque `POSTGRES_PORT` ou `API_PORT` no `.env`.

Comandos úteis:

- logs da API: `docker compose logs -f api`
- parar: `docker compose stop` (os dados ficam no volume)
- apagar tudo e recomeçar: `docker compose down -v`
- após mudar o `requirements.txt`: `docker compose up -d --build --wait`

### Testes

```bash
docker compose exec api pytest
```


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
