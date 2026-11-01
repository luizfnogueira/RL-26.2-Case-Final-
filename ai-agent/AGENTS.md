# AGENTS.md — módulo de IA

Regras para agentes de código (Claude Code, Antigravity) que mexem no assistente de IA. Arquitetura e como rodar: [README.md](README.md).

## Onde fica cada coisa

- Agente e insight: `backend/app/ai/` (PydanticAI, dentro do backend).
- Ponte com as rotas: `backend/app/services/ia_service.py` (`POST /ia`) e `backend/app/services/insight_service.py` (`POST /ia/insight`).
- Memória e log: tabela `ia.interacao` (`backend/app/models/ia.py`, `backend/app/repositories/interacao_repository.py`).
- Tela 7: `frontend/src/components/assistente/`; tipos em `frontend/src/types/ia.ts`.
- Avaliação: `ai-agent/avaliacao/`.

## Nomes da Gold

Use os nomes do Contrato Gold → API v2.3, nunca os da Silver: `dim_mes`, `dim_uc`, `dim_alimentador`, `fato_uc_mes`, `fato_alimentador_mes`, `agg_kpis_mensal`, `agg_receita_mensal`, `agg_preco_volume`, `agg_dec_fec_mensal`, `tb_fila_perdas`, `tb_fila_perdas_auditoria`, `uc_consumo_comparativo`, `uc_interrupcoes`, `uc_atendimentos`. A lista de colunas está em `backend/app/db/gold_contract.py`.

Regras que mudam números (seção 4 do contrato de dados): consumo pela coluna `consumo_kwh_valido`; receita total (com tributos) × receita de energia (sem tributos); P1 = 2022-07 a 2023-06 e P2 = 2025-07 a 2026-06; DEC/FEC de um período = soma dos meses; score da fila não é probabilidade de fraude.

## Contrato

- `PerguntaIA` e `RespostaIA` usam `extra='forbid'`: campo novo entra no schema (`backend/app/schemas/ia.py`), nos tipos do front, nos fixtures (`backend/app/services/fixtures/resposta_ia*.json`, depois `npm run mocks:sync`) e em `docs/api-contract.md` no mesmo PR.
- Campos da sprint de GenAI (`conversa_id`, `apresentacao`, `detalhes_tecnicos`) são opcionais. Os blocos de `detalhes_tecnicos` aceitam campos extras.
- Resposta fora do contrato vira 503 no chat. No insight, vira o texto por regra.

## Dados confidenciais

- O repositório é público. Nunca versione dados reais: CSV, JSON de dados, XLSX, `.db`, dumps, `.env`, chaves ou saídas de célula. `avaliacao_ultima.json` só leva métricas.
- O agente consulta só as views do schema `agente`, com o usuário somente leitura. Ele nunca vê `nome_titular`, `cpf_cnpj` nem endereço.
- Para o modelo vão só a pergunta, o contexto do schema e o resultado da consulta. Ao histórico vão o resumo e o SQL, nunca as linhas de dados.
- Pergunta e resposta são mascaradas (CPF, CNPJ, e-mail) antes de gravar em `ia.interacao`.
- Nenhum número do texto pode sair do modelo: use marcadores (`{v1}`, `{efeito_preco}`) preenchidos pelo código.

## Testes e avaliação

```bash
cd backend && pytest                                   # sem gastar tokens: FunctionModel/TestModel
cd frontend && npm run typecheck && npm test && npm run lint
```

- Testes de banco: só com `TEST_DATABASE_URL` apontando para um banco descartável.
- Teste nunca chama o modelo real; use `FunctionModel` (passos do agente) ou `TestModel`.
- A avaliação (`ai-agent/avaliacao/avaliar.py`) não pode piorar: acurácia igual ou maior e taxa de invenção de 0%.

## Convivência

- Commits: `feat(ai-agent): ...`, com o ID da tarefa (`GENAI-n`).
- Arquivos do time de Dev só mudam por PR revisado pelo dono: `ia_service.py`, Tela 7 e Compose (Thiago); `insight_service.py` e tipos do front (Gheyson); importador e seed (Arthur).
- Todo PR é revisado por outra pessoa da Equipe 3.
