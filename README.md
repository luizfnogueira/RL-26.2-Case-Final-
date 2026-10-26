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

| Variável             | Padrão                  | Uso                                                                   |
| -------------------- | ----------------------- | --------------------------------------------------------------------- |
| `VITE_API_URL`       | `http://localhost:8000` | URL base da API FastAPI                                               |
| `VITE_USE_MOCKS`     | `true`                  | `true`: usa mocks rotulados como fictícios e dispensa o backend       |
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
);
```

### Autenticação no cliente HTTP

Com `VITE_USE_MOCKS=false`, o cliente HTTP (`services/http.ts`) é o único lugar que envia `Authorization: Bearer <token>`, lendo o token de `auth/tokenStorage.ts` (`get`, `set`, `clear`, chave `venergy_token`). Login e cadastro não levam token. Um 401 em qualquer outra rota limpa o token e chama o gancho registrado por `aoNaoAutorizado(fn)` (em `auth/naoAutorizado.ts`); sem gancho, o navegador vai para `/login?destino=...`. O 401 de credenciais inválidas no login não derruba a sessão. A tela de login só deve aceitar `destino` quando for um caminho do próprio portal (começa com `/` e não com `//`).

### Componentes comuns e filtros

Em `src/components/ui`: `Button`, `Card`, `Input`, `Select`, `Modal`, `Tabela` (ordenação local ou no servidor, com paginação), `Paginacao`, `Badge`, `Skeleton`, `ErrorState`, `EmptyState` e `SeloFicticio` (rótulo "Dado fictício" para telas com mock). Para ver todos funcionando: `npm run dev` e abra `/dev/componentes` (a rota não existe no build de produção).

Os filtros ficam na URL, com os mesmos nomes dos parâmetros da API, então recarregar a página, voltar no navegador ou compartilhar o link preservam o estado. A tela monta a barra com os filtros que usa e lê os valores com o mesmo conjunto:

```tsx
const CAMPOS = ['periodo_atual', 'periodo_comparacao', 'municipio', 'bairro'] as const
const PADROES = { periodo_atual: '2025-07/2026-06', periodo_comparacao: '2022-07/2023-06' }

const { filtros } = useFiltrosUrl(CAMPOS, PADROES)
const { dados, erro, carregando, recarregar } = useConsulta(
  (sinal) => buscarDashboard({ ...PADROES, ...filtros }, sinal),
  [filtros],
)

<BarraDeFiltros campos={CAMPOS} padroes={PADROES} opcoes={OPCOES_FILTROS_MOCK} />
```

`bairro` só habilita depois do município, e trocar o município limpa o bairro. Os domínios dos filtros (`opcoes`) vêm de `src/data/filtros.mock.ts`: o contrato ainda não tem rota para listá-los.
