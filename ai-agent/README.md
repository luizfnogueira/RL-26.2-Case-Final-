# Assistente de IA do V-Energy Grid 360

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
