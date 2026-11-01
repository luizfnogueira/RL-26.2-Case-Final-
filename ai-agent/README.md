# Assistente de IA do V-Energy Grid 360

O módulo de IA aparece de dois jeitos no portal:

- **Assistente (Tela 7 e painel flutuante)**, `POST /ia`. A pessoa pergunta em português; o agente gera um SQL somente leitura, consulta a Gold e responde com os números do resultado.
- **Insight da receita (Tela 2)**, `POST /ia/insight`. Os seis números da ponte vêm da Gold; o modelo escreve só o texto em volta deles.

O agente roda **dentro do backend** (`backend/app/ai/`), com o PydanticAI. A avaliação (golden set e script) fica nesta pasta, em `avaliacao/`. Contrato da API: [docs/api-contract.md](../docs/api-contract.md), seções 9 e 10.

## Arquitetura: CHESS simplificado

Só uma etapa usa o modelo para responder (o agente gerador). As outras são código determinístico, que não gasta tokens nem inventa nada. A etapa UT do CHESS (testes gerados por LLM a cada pergunta) virou o golden set, rodado fora do caminho da pergunta.

| # | Etapa | Arquivo | Tarefa | Estado |
| --- | --- | --- | --- | --- |
| 1 | Roteador de intenção: escolhe a rota (`seguranca`, `apresentacao`, `fora_de_escopo`, `esclarecimento`, `dados_ausentes` ou `consulta`) antes de qualquer consulta, sem tokens; só `consulta` segue para o agente | `intencao.py` | extra | pronto |
| 1a | Pré-filtro: segurança (escrita, injeção, prompt, dados pessoais), saudação e fora de escopo | `guardrails.py` | GENAI-22 | pronto |
| 1b | Esclarecimento: bairro em vários municípios ou "este ano" voltam com opções | `services/esclarecimento_ia.py` | extra | pronto |
| 1c | Dados ausentes: todos os anos citados fora de jul/2022 a jun/2026 (exceto datas do cadastro, como ligação e medidor) | `intencao.py` | extra | pronto |
| 2 | Memória: últimas 3 trocas da conversa e resumo das 10 anteriores | `repositories/interacao_repository.py`, `agent.converter_historico_para_mensagens` | GENAI-11, 13 | pronto |
| 3 | IR: liga "Jaboatão" ao valor do banco | `entidades.py` | GENAI-8 | pendente (hoje `valores_distintos` usa listas fixas) |
| 4 | SS: escolhe 1 ou 2 skills | `roteador.py`, `skills/` | GENAI-7, 23 | `receita.md` pronta; demais skills pendentes |
| 5 | CG: plano → SQL → `consultar_gold` → corrige até 2× | `agent.py` | GENAI-9 | pronto |
| 6 | Validação de saída: marcadores e números conferidos | `resposta.py` | GENAI-10 | pronto |
| 7 | Apresentação: texto ou tabela | `resposta.py` | GENAI-14 | pronto |
| 7b | Gráfico na conversa: barras, pizza ou linhas pela forma dos dados, sem tokens | `services/grafico_ia.py`, `components/graficos/` | extra | pronto |
| 8 | Telemetria e gravação | `telemetria.py`, `interacao_repository.registrar` | GENAI-17, 20 | pronto |
| 8b | Respostas pré-calculadas: pergunta igual ou parecida, mesmos nomes e números, sai do cache sem tokens | `services/cache_respostas.py`, tabela `ia.resposta_cache` | extra | pronto |
| — | Ponte com o `POST /ia`: memória, prazo, log | `services/ia_service.py` (`AgenteReal`) | GENAI-2 | pronto |
| — | Insight da Tela 2 | `ai/insights.py`, `services/insight_service.py` (`GeradorIA`) | GENAI-25 | pronto |

Caminho de uma pergunta com `IA_MODO=real`:

1. O backend cria o `conversa_id` na primeira pergunta e carrega as últimas trocas daquela conversa.
2. O roteador de intenção classifica a pergunta (`Intencao`, schema Pydantic). As rotas que não consultam o banco respondem na hora: segurança com `bloqueado`, fora de escopo e dados ausentes com `nao_sei`, esclarecimento com `esclarecer`. Se o agente não conseguir comprovar o número na rota `consulta`, a resposta também sai `nao_sei`.
3. `responder()` escolhe as skills, monta as instruções (regras críticas no começo e no fim) e roda o agente com `UsageLimits(request_limit=6)`.
4. O agente preenche o plano, chama `consultar_gold`, corrige o SQL se der erro e devolve o texto com marcadores (`{v1}`), que o código preenche com os valores do resultado.
5. A ponte confere a resposta contra o contrato, grava a troca em `ia.interacao` e devolve a resposta com `apresentacao` e `detalhes_tecnicos`.
6. Falha do provedor, estouro do prazo (`IA_TIMEOUT_S` − 5 s) ou resposta fora do contrato: 503 `AGENTE_INDISPONIVEL`. No insight, falha vira o texto por regra, nunca 503.

## Segurança em camadas

| Camada | O que segura | Onde |
| --- | --- | --- |
| A1 · usuário do banco só para o agente | Escrita, schemas `portal` e `ia`, dados pessoais (views sem `cpf_cnpj`, `nome_titular`, endereço) | `db/session.obter_engine_agente` + script SQL (GENAI-5) |
| A2 · validador de SQL | Mais de um comando, escrita dentro de `WITH`, funções perigosas, tabelas fora da lista | `ai/consulta.py` (GENAI-6) |
| Regras do agente | Só `SELECT`, consumo negativo, recusa de pedido de titular ou CPF | `agent.py` |
| Marcadores + `output_validator` | Número fora dos dados (chat e insight) | `resposta.py`, `insights.py` |
| Memória no servidor | Histórico forjado pelo navegador; trocas bloqueadas não voltam ao modelo | `interacao_repository.py` |
| Front sem HTML vindo da resposta | XSS pela resposta, pelo SQL ou pelos detalhes técnicos | Tela 7 (teste com `<img onerror>`) |
| Chave só no `backend/.env` | Vazamento de credencial | `ai/modelo.py`; nunca em código, log ou resposta |

**Até a GENAI-6 ser entregue, `IA_MODO=real` responde 503.** A ponte importa `executar_consulta` de `backend/app/ai/consulta.py`; enquanto o arquivo não existe, o log da API mostra `IA_MODO=real sem a ferramenta de consulta`. O agente não consulta o banco sem o validador e o usuário somente leitura.

## Memória da conversa

O front guarda só o `conversa_id` e o reenvia. O histórico fica no servidor, na tabela `ia.interacao`. Ao agente vão as 3 últimas trocas `ok` das últimas 2 horas, como pares de mensagens user/model: a pergunta interpretada, um resumo de até 300 caracteres e o SQL executado. As linhas de dados nunca vão. "Limpar conversa" começa um id novo.

Resumo da conversa antiga: com mais de 3 trocas, as 10 perguntas anteriores (só a pergunta interpretada, até 150 caracteres cada) entram como uma lista antes das 3 trocas completas (`interacao_repository.carregar_resumo`). Não é prompt cache: é memória. Custa uns 20 a 40 tokens de entrada por pergunta antiga e nenhuma chamada a mais ao modelo, porque a lista é montada pelo código. O resumo não é gravado nem devolvido ao front. Depois de 13 trocas, uma pergunta sobre o começo da conversa responde "não sei" sem chamar o modelo.

## Como rodar

1. Configure o modelo no `backend/.env`; a chave nunca vai para o Git. Exemplo com a API gratuita do Gemini, usando o modelo recomendado pelo case. Chaves novas podem não ter acesso ao `gemini-2.5-flash-lite`, que é o padrão do `modelo.py`.

   ```env
   IA_MODO=real
   LLM_PROVIDER=google
   LLM_MODELO=gemini-3.1-flash-lite
   LLM_API_KEY=sua-chave
   ```

   No plano gratuito, o Google pode usar o conteúdo enviado para melhorar os produtos dele. Por isso o agente só manda a pergunta, o contexto do schema e o resultado agregado da consulta, nunca dados pessoais.

   | Variável | Para quê |
   | --- | --- |
   | `IA_MODO` | `mock` (respostas prontas, sem modelo) ou `real` |
   | `LLM_PROVIDER` | `google`, `openrouter`, `openai`, `groq` ou `test` |
   | `LLM_MODELO` | Nome do modelo no provedor (`LLM_MODELO_SQL` e `LLM_MODELO_INSIGHT` sobrescrevem por perfil) |
   | `LLM_API_KEY` | Chave do provedor (também aceita `OPENROUTER_API_KEY`, `IA_API_KEY`, `GEMINI_API_KEY`) |
   | `IA_TIMEOUT_S` | Prazo do `POST /ia`; o agente tem 5 s a menos |
   | `AI_CACHE_ENABLED` | `1` (padrão) reaproveita respostas de perguntas iguais ou muito parecidas sem histórico: em memória (agente) e em `ia.resposta_cache` (ponte, sobrevive a reinícios); `0` desliga os dois |
   | `AI_MODO_SCHEMA` | `skills` (padrão) ou `catalogo_inteiro`, para comparar no golden set |
   | `AI_SELF_CONSISTENCY` | `1` liga a votação entre candidatos quando a confiança vem baixa (desligado por padrão) |

2. Crie a tabela das conversas: `python -m app.db.init_portal` (ou `docker compose exec api python -m app.db.init_portal`).
3. Reinicie a API para ler o `.env` (no Docker: `docker compose up -d --force-recreate api`).
4. No front, use `VITE_USE_MOCKS=false` para falar com a API.

Testes, sem gastar tokens (o modelo é um `FunctionModel`/`TestModel` do PydanticAI):

```bash
cd backend
pytest tests/test_ia*.py tests/test_ai_*.py tests/test_insight.py tests/test_sugestoes_golden.py
```

Os testes da tabela `ia.interacao` usam o PostgreSQL só com `TEST_DATABASE_URL` apontando para um banco descartável, como os demais testes de banco.

## Como avaliar (GENAI-26, 27)

O golden set (`avaliacao/perguntas.yaml`) e o script (`avaliacao/avaliar.py`) estão em construção. O script grava `backend/app/ai/avaliacao_ultima.json`, só com métricas, e o painel "Detalhes técnicos" mostra o último run. Formato esperado: [contrato, seção 9](../docs/api-contract.md). Toda pergunta sugerida na Tela 7 precisa estar no golden set com status `ok`; o teste `backend/tests/test_sugestoes_golden.py` passa a conferir isso quando o arquivo existir.

## Integração ponta a ponta (GENAI-28)

Roteiro antes do congelamento, com a Gold real:

1. Backend com `GOLD_SOURCE=real`, `IA_MODO=real` e a chave do modelo; `python -m app.db.init_portal` rodado.
2. Front com `VITE_USE_MOCKS=false`.
3. Tela 7: as três perguntas do case, um follow-up ("E só comercial?"), uma resposta em tabela, os detalhes técnicos, "Testar segurança" (bloqueado) e "Testar não sei".
4. Tela 2: o insight com o selo "Gerado por IA" e os mesmos números do gráfico de cascata.
5. Provedor fora do ar (chave errada): o chat mostra a mensagem de indisponível e o insight cai no texto alternativo.
6. Rodar as perguntas sugeridas e conferir com o gabarito. O console do navegador tem que ficar sem erro; tire prints.

## Log de auditoria (B1)

Em `IA_MODO=real`, toda resposta do `POST /ia` grava uma linha em `ia.interacao`, inclusive `bloqueado` e `nao_sei`. A mesma tabela guarda a memória da conversa. A gravação usa a conexão da API, e o usuário somente leitura do agente não enxerga o schema `ia`. CPF, CNPJ e e-mails digitados são mascarados antes de gravar. Linhas com mais de 30 dias são apagadas quando a API sobe.

A tabela é criada por `python -m app.db.init_portal` e pelo seed. Recarregar a Gold não a apaga.

Tentativas bloqueadas e o motivo de cada uma (útil na demo):

```sql
SELECT criado_em, pergunta, motivo, sql_executado
FROM ia.interacao
WHERE status = 'bloqueado'
ORDER BY criado_em DESC
LIMIT 50;
```

Perguntas que o agente não soube responder:

```sql
SELECT criado_em, pergunta, motivo
FROM ia.interacao
WHERE status = 'nao_sei'
ORDER BY criado_em DESC
LIMIT 50;
```

Volume, latência p95 e tokens por dia:

```sql
SELECT criado_em::date AS dia,
       count(*) AS perguntas,
       count(*) FILTER (WHERE status = 'bloqueado') AS bloqueadas,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia_ms) AS latencia_p95_ms,
       sum(tokens_entrada) AS tokens_entrada,
       sum(tokens_saida) AS tokens_saida
FROM ia.interacao
GROUP BY 1
ORDER BY 1 DESC;
```

Perguntas reais para revisar o golden set. Saem já mascaradas, mas o arquivo **não vai para o Git**: o `.gitignore` recusa `*.csv`.

```sql
\copy (SELECT criado_em, pergunta, pergunta_interpretada, status, motivo FROM ia.interacao ORDER BY criado_em) TO 'perguntas_reais.csv' CSV HEADER
```
