# RL-26.2-Case-Final-

## Backend

Banco de dados: **PostgreSQL 16+**. A Gold fica no schema `gold`, as ordens do portal no schema `portal` e as conversas do assistente de IA no schema `ia`; a recarga da Gold nunca toca no `portal` nem no `ia`.

O fluxo de carga real é CSV → PostgreSQL, sem banco intermediário; use `GOLD_SOURCE=real`. O seed permanece somente para desenvolvimento em banco separado. A documentação técnica e o guia operacional são distribuídos separadamente pela equipe no Drive, junto das orientações de acesso aos dados privados.

O pacote de entrega contém **14 CSVs + `_manifesto.csv`**. O importador não recebe
arquivos `.db`. Um backup PostgreSQL custom (assinatura `PGDMP`) é um formato
separado, restaurado com `pg_restore`; a extensão recomendada é `.dump`. Não é
SQLite e não substitui o pacote CSV na rotina de importação.

### Pré-requisitos

- Docker com Docker Compose
  - Fedora: `sudo dnf install docker-cli docker-compose moby-engine && sudo systemctl enable --now docker && sudo usermod -aG docker $USER` (saia e entre de novo na sessão)
  - Ubuntu/Debian: `sudo apt install docker.io docker-compose-v2 && sudo usermod -aG docker $USER` (saia e entre de novo na sessão)
  - Windows e macOS: Docker Desktop em docs.docker.com/get-docker

### Desenvolvimento com dados fictícios (sem CSVs privados)

O `.env.example` usa `GOLD_SOURCE=seed` por padrão. Este caminho permite
desenvolver sem acesso ao pacote privado. Use um banco separado da Gold real.

```bash
cd backend
cp .env.example .env                              # defina POSTGRES_PASSWORD
docker compose up -d --build --wait
docker compose exec api python -m app.db.init_portal
docker compose exec api python -m app.db.seed
```

Após a carga do seed, `/dashboard` e `/filtros` usam os dados fictícios.

### Execução com a Gold real

Use um banco dedicado e coloque os 14 CSVs e `_manifesto.csv` privados em
`backend/data/gold`. No `.env`, configure explicitamente `GOLD_SOURCE=real`.
Conclua a importação antes de consultar os endpoints.

```bash
cd backend
cp .env.example .env                              # defina POSTGRES_PASSWORD (as credenciais ficam só no .env)
# Edite .env e altere GOLD_SOURCE para real antes de subir a API.
docker compose up -d --build --wait               # sobe o PostgreSQL e a API e espera ficarem prontos
# Coloque os 14 CSVs e _manifesto.csv privados em backend/data/gold.
docker compose exec api python -m app.db.init_portal  # apenas na instalação inicial
docker compose exec api python -m app.db.importar_gold_postgres
docker compose exec api python -m app.db.verificar_gold --csv-dir data/gold
```

Se o `.env` já existe, edite-o sem sobrescrever suas credenciais. Após mudar
`GOLD_SOURCE`, execute `docker compose up -d --force-recreate api` para aplicar
a configuração; apenas reiniciar o processo não atualiza o ambiente do container.

Se o banco ainda tiver as tabelas provisórias do seed, a carga bloqueia a mudança
de contrato. Depois de conferir o diagnóstico, `--migrate-legacy` habilita a
adequação transacional das tabelas conhecidas `tb_fila_perdas`,
`tb_fila_perdas_auditoria` e `agg_preco_volume`. Os demais contratos divergentes
exigem revisão manual. Não execute o seed sobre o banco real.

Com `GOLD_SOURCE=real`, o dashboard (incluindo ponte e drill-down), os filtros e a
fila consultam a Gold importada. O insight de receita utiliza os mesmos números;
o modo do gerador de texto é controlado separadamente por `IA_MODO`. As respostas
informam a origem real e a data de exportação do manifesto. As rotas ainda
simuladas de outras frentes continuam sendo responsabilidade de seus módulos.

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

| Variável             | Padrão                  | Uso                                                                   |
| -------------------- | ----------------------- | --------------------------------------------------------------------- |
| `VITE_API_URL`       | `http://localhost:8000` | URL base da API FastAPI                                               |
| `VITE_USE_MOCKS`     | `true`                  | `true`: usa mocks rotulados como fictícios e dispensa o backend       |
| `VITE_MOCK_DELAY_MS` | `350`                   | Atraso artificial dos mocks (ms), para ver os estados de carregamento |

### Conectar o frontend ao backend e à Gold

Para executar a fila e a gestão de ordens contra a API, configure `frontend/.env` com
`VITE_USE_MOCKS=false` e `VITE_API_URL=http://localhost:8000`, então reinicie o Vite.
Com `backend/.env` em `GOLD_SOURCE=real` e a carga da Gold concluída, as telas de fila
e ordens buscam as opções regionais em `GET /filtros`, candidatos em
`GET /inspecoes/candidatos` e leem/criam/atualizam ordens em `GET/POST /inspecoes` e
`PATCH /inspecoes/{id}`. As ordens continuam persistidas no schema `portal`; os filtros
e a fila vêm da Gold.
Para validar a integração sem os CSVs privados, mantenha `GOLD_SOURCE=seed`; as mesmas
rotas usam o cadastro fictício.

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

### Tela 2: diagnóstico da receita (`/receita`)

Filtros na URL (`periodo_atual`, `periodo_comparacao`, `municipio`, `bairro`, `classe`, `page`). O nível do drill-down segue os filtros (sem município lista municípios; com município, bairros; com bairro, classes) e o breadcrumb remove os filtros descendentes. A ponte decompõe a **receita de energia, sem tributos** (base → efeito-preço → efeito-volume → atual), por isso não coincide com a receita faturada do painel. O bloco "Análise da IA" chama `POST /ia/insight` com os seis números da ponte; se a IA falhar, só esse bloco mostra o erro. Fora de P1 × P2 ou com filtro de alimentador, a API devolve a ponte com valores `null` e o drill-down vazio, com o motivo em `metadados.observacoes`; a tela mostra o motivo no lugar do gráfico. Os nomes de município e bairro seguem como estão no banco (a Gold usa maiúsculas, ex.: `BOA VISTA`) ao montar a URL e a consulta; só o rótulo exibido é ajustado (`formatarNome`). Na integração (F-int), as listas de `data/filtros.mock.ts` precisam trazer esses mesmos valores. O gráfico (`components/graficos/Cascata.tsx`) é SVG próprio, sem biblioteca, com tooltip por barra, legenda e visão em tabela.

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

`bairro` só habilita depois do município, e trocar o município limpa `bairro` e `alimentador`. As telas de fila e ordens leem os domínios de `GET /filtros` com `useOpcoesFiltros` e `paraOpcoesBarra` — os valores são os da Gold (maiúsculas) e só o rótulo exibido é ajustado. A tela de receita ainda usa `src/data/filtros.mock.ts`.

## Assistente de IA

Agente Text-to-SQL do portal (Tela 7 e painel flutuante, `POST /ia`) e insight da receita gerado por IA (Tela 2, `POST /ia/insight`). Arquitetura, segurança, como rodar e como avaliar: [ai-agent/README.md](ai-agent/README.md). Regras para agentes de código: [ai-agent/AGENTS.md](ai-agent/AGENTS.md).

Decisões do módulo:

- **PydanticAI dentro do backend**, sem serviço HTTP separado. O modelo vem de uma API gratuita de provedor arbitrário; trocar de provedor é mudar o `.env` (`LLM_PROVIDER`, `LLM_MODELO`, `LLM_API_KEY`).
- **CHESS simplificado**: recuperação de valores e seleção de schema (skills) em código, um único agente gerador com três ferramentas, e o golden set no lugar dos testes gerados por LLM.
- **Números nunca saem do modelo**: o texto usa marcadores (`{v1}`, `{efeito_preco}`) preenchidos pelo código com os valores do banco. Um validador de saída pede nova tentativa; se o erro se repetir, o chat responde "não sei" e o insight usa o texto por regra.
- **Somente leitura em camadas**: usuário do banco só para o agente, validador de SQL, regras nas instruções, pré-filtro e front sem HTML vindo da resposta.
- **Memória no servidor**: tabela `ia.interacao` com `conversa_id`. O front reenvia só o id. A mesma tabela serve de log de auditoria, com retenção de 30 dias e CPF, CNPJ e e-mail mascarados.
- **Detalhes técnicos auditáveis**: o painel separa o que foi registrado (plano, ferramentas, SQL, tokens, tempo) do que o modelo declarou (justificativa), e as métricas do golden set das verificações da resposta.

Suposições: o agente não vê nome, documento nem endereço do titular ("quem é o titular" fica para a Tela 3); o agente não lê o schema `portal`, que tem texto livre digitado por usuários; a conversa expira após 2 h sem perguntas; e "último ano" sem período explícito é tratado como premissa declarada na resposta.

Resultados da avaliação (acurácia, taxa de invenção, bloqueio de ataques e configuração escolhida): a preencher com o primeiro run do `ai-agent/avaliacao/avaliar.py` (GENAI-27).
