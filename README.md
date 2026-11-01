# RL-26.2-Case-Final-

## Autenticação: configuração obrigatória

**Depois de atualizar para esta versão, as rotas de negócio da API exigem login.**
Prepare o ambiente antes de usar o portal, inclusive se você desenvolve somente o frontend
com dados mockados. `VITE_USE_MOCKS` controla os dados de negócio; cadastro, login e perfil
sempre usam a API e o PostgreSQL. Não há conta, senha ou convite padrão no código.

### 1. Criar os arquivos de ambiente sem sobrescrever os existentes

Execute na **raiz do repositório**. O pull não traz os `.env` locais.

PowerShell (Windows):

```powershell
if (!(Test-Path backend/.env)) {
    Copy-Item backend/.env.example backend/.env
}
if (!(Test-Path frontend/.env)) {
    Copy-Item frontend/.env.example frontend/.env
}
```

Bash (Linux/macOS/Git Bash):

```bash
test -f backend/.env || cp backend/.env.example backend/.env
test -f frontend/.env || cp frontend/.env.example frontend/.env
```

Se os arquivos já existem, apenas acrescente ou confira as variáveis abaixo. Preserve a
conexão, as senhas e as configurações de dados/IA já usadas pelo seu ambiente.

### 2. Configurar chave, convite e conexão

Gere uma chave **localmente**, sem copiar a de outra instalação:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Se não tiver Python instalado, pode usar a imagem oficial pelo Docker:

```bash
docker run --rm python:3.13-slim python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Edite `backend/.env`:

| Variável | O que configurar |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | A conexão do PostgreSQL desse ambiente; a senha do exemplo vem vazia e deve ser preenchida. Não troque as credenciais de um volume existente só para habilitar o AUTH. |
| `DATABASE_URL` | Conexão usada fora do Docker, coerente com o banco existente. Dentro do Compose, a API recebe a conexão com o host `postgres`. |
| `JWT_SECRET` | Cole a chave gerada pelo comando acima. Deve ter pelo menos 32 bytes. Mantenha-a estável nesse ambiente; trocar a chave invalida as sessões emitidas anteriormente. |
| `AUTH_INVITE_CODE` | Defina um convite não vazio, com até 128 caracteres, ou use o definido pelo responsável pelo backend compartilhado. O código é sensível a maiúsculas e minúsculas. |
| `CORS_ORIGINS` | Inclua a origem do frontend, por exemplo `http://localhost:5173` e/ou `http://127.0.0.1:5173`. |

O convite atual é **compartilhado por ambiente**, não é de uso único e não tem expiração
própria. Cada instalação local pode ter seu código; quem usa o mesmo backend usa o convite
desse backend. Alterar o convite não apaga contas existentes nem muda suas senhas.

Em `frontend/.env`, confira `VITE_API_URL` (normalmente `http://localhost:8000`) e
`VITE_USE_MOCKS`: `false` para dados da API; `true` para dados de negócio fictícios.
Quem usa apenas esses mocks pode subir o backend com `GOLD_SOURCE=seed` e `IA_MODO=mock`,
sem carregar a Gold para autenticar. Para trabalhar com dados reais, preserve a configuração
e a carga existentes. **Não execute seed ou recarga da Gold para testar autenticação.**

Nunca envie os `.env`, chaves, senhas, convites ou tokens ao GitHub, ao PR ou ao grupo.
Compartilhe o convite necessário ao cadastro por canal privado. `JWT_SECRET` e
`AUTH_INVITE_CODE` ficam somente no backend: variáveis `VITE_` são públicas no navegador.
As antigas flags `AUTH_ENABLED` e `VITE_AUTH_PREVIEW_API` não liberam acesso anônimo.

### 3. Subir ou atualizar os serviços

Na raiz do repositório:

```bash
docker compose -f backend/docker-compose.yml up -d --build --wait
```

O Compose cria ou atualiza `portal.usuarios`, incluindo o campo opcional de cargo,
sem recarregar a Gold e sem redefinir contas, senhas ou permissões existentes.
Na execução manual fora do Compose, instale `backend/requirements.txt` no seu ambiente
Python e execute `python -m app.db.init_auth` **na pasta `backend`** antes de iniciar a API.

Depois de editar o `.env` do backend, recrie a API para aplicar as variáveis; `restart`
sozinho mantém o ambiente anterior do container:

```bash
docker compose -f backend/docker-compose.yml up -d --force-recreate api
```

Em outro terminal:

```bash
cd frontend
npm ci
npm run dev
```

Reinicie o Vite depois de mudar `frontend/.env`.

### 4. Criar a conta e entrar

1. Abra `http://localhost:5173/cadastro` (ou o endereço informado pelo Vite).
2. Informe nome, e-mail individual válido, senha de 8 a 128 caracteres, confirmação da
   senha e o convite configurado no backend acessado. Domínios reservados como `.test`
   são recusados; não use o mesmo e-mail para várias pessoas no backend compartilhado.
3. Ao concluir, o portal volta ao login com o e-mail preenchido. Entre com o mesmo e-mail
   e senha; o convite é solicitado somente no cadastro. Não há etapa de confirmação por e-mail.
4. O login abre o painel ou o destino interno preservado. No menu do avatar, use
   **Editar perfil** para salvar **Cargo ou área** (opcional, até 80 caracteres) e
   **Sair da conta** para limpar a sessão local.

O cadastro cria perfil `usuario`. O bootstrap de administrador é uma ação explícita do
responsável pelo ambiente: configurar `AUTH_ADMIN_NOME`, `AUTH_ADMIN_EMAIL` e
`AUTH_ADMIN_PASSWORD` no backend e executar `python -m app.db.seed_auth` na pasta
`backend` (ou `docker compose exec api python -m app.db.seed_auth` na mesma pasta).
Esse comando não promove uma conta comum existente nem redefine sua senha.

### Diagnóstico de acesso

| Situação | Comportamento |
| --- | --- |
| `JWT_SECRET` vazio | `503 AUTH_INDISPONIVEL` no cadastro, login, perfil e rotas protegidas. Configure a chave e recrie a API. Uma chave preenchida, mas inválida/curta, impede a inicialização; confira os logs sem publicar seus valores. |
| `AUTH_INVITE_CODE` vazio | Somente novos cadastros recebem `503 CADASTRO_INDISPONIVEL`. Contas já existentes continuam entrando se o JWT estiver configurado. |
| Convite incorreto | `403 CONVITE_INVALIDO`; a conta não é criada. Confira o convite do backend que o frontend acessa. |
| E-mail já cadastrado | `409 EMAIL_JA_CADASTRADO`; use o login dessa conta. |
| Token ausente, expirado ou rejeitado | `401 NAO_AUTENTICADO`; o portal retorna ao login. Senha incorreta no login retorna `401 CREDENCIAIS_INVALIDAS`. |
| Apenas o frontend está rodando | Login/cadastro não funcionam, mesmo com dados de negócio mockados. Suba a API e o PostgreSQL e confira `VITE_API_URL`/CORS. |

`GET /health` é público e não verifica a configuração do AUTH: uma API saudável pode
responder `503 AUTH_INDISPONIVEL` se a chave não foi configurada.
Os corpos HTTP, limites e erros estão no [contrato da API](docs/api-contract.md).

### Decisões pendentes do time

- **Permissões:** hoje todas as contas ativas autenticadas têm as mesmas permissões de
  leitura e escrita nas rotas de negócio, inclusive ordens, respeitando as validações de
  cada rota. `perfil` não filtra recortes ou operações; Cargo ou área é apenas apresentação.
  Se o time adotar hierarquia, deverá definir e aplicar a política no backend, por exemplo
  exigir administrador nas escritas. Essa restrição ainda não está implementada.
- **Tentativas de login:** ainda não há limite de tentativas ou bloqueio temporário.
  A política e sua implementação precisam ser combinadas pelo time.
- **Demo e entrega:** definir quem administra o ambiente, quem terá conta, qual convite
  será usado e como fornecê-lo em privado. Os valores não devem ser registrados aqui.
- **Comunicação:** antes de integrar o AUTH na main, avisar o grupo sobre a configuração
  obrigatória e a necessidade de backend para quem usa mocks. Atualizar a main, sozinho,
  não configura os `.env` nem cria contas.

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
test -f .env || cp .env.example .env              # preserve o existente; configure banco e AUTH conforme a seção inicial
docker compose up -d --build --wait
docker compose exec api python -m app.db.init_portal
docker compose exec api python -m app.db.seed
```

Após a carga do seed, `/dashboard` e `/filtros` usam os dados fictícios mediante autenticação.

### Execução com a Gold real

Use um banco dedicado e coloque os 14 CSVs e `_manifesto.csv` privados em
`backend/data/gold`. No `.env`, configure explicitamente `GOLD_SOURCE=real`.
Conclua a importação antes de consultar os endpoints.

```bash
cd backend
test -f .env || cp .env.example .env              # preserve o existente; configure banco e AUTH conforme a seção inicial
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
npm ci
test -f .env || cp .env.example .env  # no PowerShell, use o bloco seguro da seção inicial
npm run dev
```

O portal abre em http://localhost:5173/login. A API e o PostgreSQL são necessários para
autenticar, inclusive com dados de negócio mockados.

### Variáveis de ambiente (`frontend/.env`)

| Variável             | Valor no `.env.example` | Uso                                                                   |
| -------------------- | ----------------------- | --------------------------------------------------------------------- |
| `VITE_API_URL`       | `http://localhost:8000` | URL base da API FastAPI                                               |
| `VITE_USE_MOCKS`     | `false`                 | `true`: usa mocks nos dados de negócio; autenticação continua na API |
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

Rotas públicas: `/login` e `/cadastro`. Rotas do portal, após validar a sessão:
`/painel`, `/receita`, `/unidades` e `/unidades/:id`, `/perdas/fila`, `/perdas/ordens`,
`/operacao`, `/assistente`.

### Camada de dados

O cliente HTTP comum fica em `src/services`; as chamadas e os tipos de autenticação ficam
em `src/auth/api.ts` e usam esse mesmo cliente. Os tipos de negócio em `src/types`
espelham o contrato V2 (`docs/api-contract.md`).

- **Mocks** (`VITE_USE_MOCKS=true`): `services/mock` atende as rotas de negócio com dados fictícios. As ordens de inspeção ficam em memória durante a sessão (criar, iniciar, concluir e cancelar funcionam; recarregar a página volta ao snapshot). As rotas `/auth/*` continuam usando a API real.
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

O cliente HTTP (`services/http.ts`) é o único lugar que envia `Authorization: Bearer <token>`, lendo o token de `auth/tokenStorage.ts` (`get`, `set`, `clear`, chave `venergy_token` no `localStorage`). `/auth/*` sempre usa a API real, independentemente de `VITE_USE_MOCKS`. Login e cadastro não levam token. Um 401 em qualquer outra rota limpa o token e chama o gancho registrado por `aoNaoAutorizado(fn)` (em `auth/naoAutorizado.ts`); sem gancho, o navegador vai para `/login?destino=...`. O 401 de credenciais inválidas no login não derruba a sessão. O login aceita como `destino` apenas rotas internas conhecidas do portal, preservando filtros; destinos externos, desconhecidos ou circulares voltam ao painel. O logout remove o token local, sem endpoint de revogação no servidor; um token copiado continua sujeito à expiração de 60 minutos e à verificação da conta e do perfil no banco.

### Tela 2: diagnóstico da receita (`/receita`)

Filtros na URL (`periodo_atual`, `periodo_comparacao`, `municipio`, `bairro`, `classe`, `ver`, `page`). Na visão **Região** (padrão), o nível do drill-down segue os filtros (sem município lista municípios; com município, bairros; com bairro, classes) e o breadcrumb remove os filtros descendentes. O seletor **"Ver por: Região | Classes"** (`ver=classe`) lista as classes de toda a área ou do município sem descer até o bairro; clicar numa classe aplica o filtro `classe` e volta para a visão Região. Com bairro escolhido o seletor some e o `ver` sai da URL. O ranking é ordenado pelo efeito-volume em R$ (a maior perda de receita por volume primeiro), com as 5 maiores perdas em barras acima da tabela. Com filtro de classe ativo, o botão "Comparar" fica desabilitado, porque `GET /dashboard/comparacao` não aplica esse filtro. A ponte decompõe a **receita de energia, sem tributos** (base → efeito-preço → efeito-volume → atual), por isso não coincide com a receita faturada do painel. O bloco "Análise da IA" chama `POST /ia/insight` com os seis números da ponte; se a IA falhar, só esse bloco mostra o erro. Fora de P1 × P2 ou com filtro de alimentador, a API devolve a ponte com valores `null` e o drill-down vazio, com o motivo em `metadados.observacoes`; a tela mostra o motivo no lugar do gráfico. Os nomes de município e bairro seguem como estão no banco (a Gold usa maiúsculas, ex.: `BOA VISTA`) ao montar a URL e a consulta; só o rótulo exibido é ajustado (`formatarNome`). Na integração (F-int), as listas de `data/filtros.mock.ts` precisam trazer esses mesmos valores. O gráfico (`components/graficos/Cascata.tsx`) é SVG próprio, sem biblioteca, com tooltip por barra, legenda e visão em tabela.

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
