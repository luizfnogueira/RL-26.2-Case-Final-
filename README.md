# RL-26.2-Case-Final-

## Backend

Banco de dados: **PostgreSQL 16+**. A Gold fica no schema `gold` e as ordens do portal no schema `portal`; a recarga da Gold nunca toca no `portal`.

O fluxo de carga real é CSV → PostgreSQL, sem banco intermediário; use `GOLD_SOURCE=real`. O seed permanece somente para desenvolvimento em banco separado. A documentação técnica e o guia operacional são distribuídos separadamente pela equipe no Drive, junto das orientações de acesso aos dados privados.

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
# Coloque os 14 CSVs e _manifesto.csv privados em backend/data/gold.
docker compose exec api python -m app.db.init_portal  # apenas na instalação inicial
docker compose exec api python -m app.db.importar_gold_postgres
docker compose exec api python -m app.db.verificar_gold --csv-dir data/gold
```

Documentação da API em http://localhost:8000/docs. O código em `app/` é montado no container: ao salvar, a API recarrega sozinha.

Se as portas 5432 ou 8000 já estiverem em uso, troque `POSTGRES_PORT` ou `API_PORT` no `.env`.

Comandos úteis:

- logs da API: `docker compose logs -f api`
- parar: `docker compose stop` (os dados ficam no volume)
- após mudar o `requirements.txt`: `docker compose up -d --build --wait`

### Testes

```bash
docker compose exec api pytest
```

Os testes de integração com o PostgreSQL (recarga da Gold e persistência/concorrência das ordens de
inspeção) só rodam quando `TEST_DATABASE_URL` aponta para um banco descartável, pois recriam a Gold:

```bash
docker compose exec postgres createdb -U USUARIO vgrid360_teste
docker compose exec -e TEST_DATABASE_URL=postgresql+psycopg://USUARIO:SENHA@postgres:5432/vgrid360_teste api pytest
```

Troque `USUARIO` e `SENHA` pelos valores do `.env`. Sem essa variável, esses testes são ignorados e o
restante da suíte roda normalmente.


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
| `VITE_MOCK_DELAY_MS` | `350`                   | Atraso artificial dos mocks (ms), para ver os estados de carregamento |

### Scripts

`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm run format` · `npm run format:check` · `npm test` · `npm run mocks:sync`

### Estrutura (`frontend/src`)

`layouts/` (menu, cabeçalho, rodapé, botão da IA) · `pages/` (uma por tela) · `components/` (por assunto) · `hooks/` · `services/` (cliente HTTP e `env.ts`) · `types/` · `data/` (mocks) · `utils/`.

Rotas: `/painel`, `/receita`, `/unidades` e `/unidades/:id`, `/perdas/fila`, `/perdas/ordens`, `/operacao`, `/assistente`.

### Camada de dados

O front fala com a API só por `src/services`. Cada função devolve tipos de `src/types`, que espelham o contrato V2 (`docs/api-contract.md`).

- **Mocks** (`VITE_USE_MOCKS=true`): `services/mock` atende as mesmas rotas e erros do stub do backend, com dados fictícios. As ordens de inspeção ficam em memória durante a sessão (criar, iniciar, concluir e cancelar funcionam; recarregar a página volta ao snapshot).
- **API real** (`VITE_USE_MOCKS=false`): `fetch` em `VITE_API_URL`. Todo erro chega como `ApiError` com `{status, codigo, mensagem}`.
- **Hooks**: `useConsulta` (leituras, com loading, erro e descarte de respostas antigas) e `useAcao` (POST e PATCH).
- **Fixtures**: `src/data/mocks` é cópia de `backend/app/services/fixtures`. Atualize com `npm run mocks:sync`; `npm run typecheck` falha se um fixture deixar de bater com os tipos.
- **Testes**: `npm test` cobre mocks, cliente HTTP, hooks e utilitários.

```ts
const { dados, erro, carregando, recarregar } = useConsulta(
  (sinal) => buscarDashboard({ periodo_atual, periodo_comparacao }, sinal),
  [periodo_atual, periodo_comparacao],
)
```
