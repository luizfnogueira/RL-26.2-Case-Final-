# Skill: Receita, Faturamento e Consumo Válido (Gold v2.3)

## 1. Tabelas

### `agg_receita_mensal` (preferencial para agregações mensais por município, bairro e classe)
- **Grão:** `mes_referencia` (`YYYY-MM`) × `municipio` × `bairro` × `classe` (53 mil linhas; muito mais rápida que `fato_uc_mes`).
- **Colunas:**
  - `mes_referencia` (texto `YYYY-MM`, de `'2022-07'` a `'2026-06'`)
  - `municipio` (texto em MAIÚSCULAS COM ACENTO, ex.: `'RECIFE'`, `'JABOATÃO DOS GUARARAPES'`, `'OLINDA'`)
  - `bairro` (texto em MAIÚSCULAS, ex.: `'BOA VISTA'`, `'IPUTINGA'`, `'CASA FORTE'`)
  - `classe` (texto em MAIÚSCULAS SEM ACENTO: `'RESIDENCIAL'`, `'COMERCIAL'`, `'INDUSTRIAL'`, `'RURAL'`, `'PODER PUBLICO'`)
  - `receita_total` (numeric, BRL — receita faturada COM tributos = Σ `valor_total`)
  - `receita_energia` (numeric, BRL — receita de energia SEM tributos = Σ `valor_energia`)
  - `tributos` (numeric, BRL)
  - `consumo_kwh` (numeric, kWh — já corresponde à soma de `consumo_kwh_valido`, sem leituras negativas inválidas)
  - `faturas` (int — quantidade de faturas emitidas)
  - `tarifa_media` (numeric, BRL/kWh)

### `agg_preco_volume` (preferencial para decomposição da variação de receita entre P1 e P2)
- **Grão:** `municipio` × `bairro` × `classe`.
- **Colunas:**
  - `municipio`, `bairro`, `classe`
  - `receita_energia_p1`, `receita_energia_p2` (BRL, sem tributos)
  - `kwh_p1`, `kwh_p2` (kWh faturado válido em P1 e P2)
  - `tarifa_p1`, `tarifa_p2` (BRL/kWh)
  - `variacao_receita` (BRL: `receita_energia_p2 - receita_energia_p1`)
  - `efeito_preco` (BRL: parcela da variação explicada pelo reajuste tarifário)
  - `efeito_volume` (BRL: parcela da variação explicada pela mudança de consumo em kWh)

### `agg_kpis_mensal` (preferencial para consolidado global mensal e inadimplência global)
- **Grão:** `mes_referencia` (`YYYY-MM`).
- **Colunas:** `mes_referencia`, `ano`, `mes`, `trimestre`, `periodo` (`'P1'`, `'P2'`, etc.), `bandeira_tarifaria`, `ucs_atendidas`, `faturas`, `receita_total`, `receita_energia`, `tributos`, `consumo_kwh`, `tarifa_media`, `faturas_em_aberto`, `valor_em_aberto` (inadimplência em BRL), `inadimplencia` (taxa), `leituras_estimadas`.

### `fato_uc_mes` (usar quando precisar de filtro por `alimentador`, `status` da fatura, nível de `id_uc` ou flags de leitura)
- **Grão:** `id_uc` × `mes_referencia` (2,15 milhões de linhas; fazer JOIN com `dim_uc` para `municipio`, `bairro`, `classe`, `alimentador`).
- **Colunas principais:**
  - Faturamento: `id_fatura`, `valor_energia` (sem tributos, BRL), `tributos` (BRL), `valor_total` (com tributos, BRL), `bandeira_tarifaria`, `status` (`'PAGA'`, `'EM ABERTO'`, `'CANCELADA'`, etc.).
  - Medição e Consumo: `consumo_kwh_valido` (kWh canônico tratado), `consumo_kwh` (kWh bruto), `tipo_leitura` (`'REAL'`, `'ESTIMADA'`, `'MEDIA'`), `flag_consumo_negativo` (bool), `flag_consumo_inconsistente` (bool), `flag_leitura_estimada` (bool).

### `uc_consumo_comparativo` (variação mensal por UC contra o mesmo mês do ano anterior)
- **Grão:** `id_uc` × `mes_referencia`.
- **Colunas:** `id_uc`, `mes_referencia`, `consumo_kwh`, `consumo_kwh_ano_anterior`, `variacao_pct`, `tipo_leitura`, `flag_conta_alta` (true quando consumo > 20% acima do mesmo mês do ano anterior).

---

## 2. Regras de Negócio Obrigatórias

1. **REGRA CRÍTICA DE CONSUMO NEGATIVO (`flag_consumo_negativo` e `consumo_kwh_valido`):**
   - Na tabela `fato_uc_mes`, existem registros em que o medidor gerou consumo negativo que não pôde ser recuperado na engenharia de dados, marcados com `flag_consumo_negativo = TRUE`.
   - **Em TODA consulta normal de consumo** (ex.: *"qual foi o menor consumo do mês?"*, *"qual a média de consumo?"*, *"ranking de consumo"*, *"consumo total"*):
     - **NUNCA** exiba nem retorne um consumo negativo na tela do usuário.
     - Sempre utilize a coluna `consumo_kwh_valido` e inclua obrigatoriamente no `WHERE`:
       `flag_consumo_negativo = FALSE AND consumo_kwh_valido IS NOT NULL AND consumo_kwh_valido >= 0`
     - Quando o usuário perguntar pelo **menor consumo** registrado entre unidades consumidoras ativas com leitura efetiva, filtre `flag_consumo_negativo = FALSE AND consumo_kwh_valido > 0` (declarando a premissa de excluir consumos negativos/zerados).
     - Na tabela `uc_consumo_comparativo`, sempre filtre `consumo_kwh >= 0` (e `consumo_kwh_ano_anterior > 0` em comparações percentuais).
   - **Única Exceção:** Somente consulte `flag_consumo_negativo = TRUE` (ou `consumo_kwh < 0`) se o usuário **pedir explicitamente** os casos de erro de medidor, falha de leitura ou consumo negativo (ex.: *"quais foram os casos em que o medidor deu erro e deu consumo negativo?"*).

2. **Receita Faturada vs. Receita de Energia (Regra 4.2):**
   - **Receita faturada (total / conta de luz):** inclui tributos (`receita_total` em `agg_receita_mensal` / `agg_kpis_mensal`, ou `valor_total` em `fato_uc_mes`). Consolidado: R$ 157,11 mi em P1 e R$ 169,68 mi em P2 (+8,0%).
   - **Receita de energia (líquida / ponte de receita):** sem tributos (`receita_energia` em `agg_receita_mensal` / `agg_kpis_mensal` / `agg_preco_volume`, ou `valor_energia` em `fato_uc_mes`). Consolidado: R$ 117,83 mi em P1 e R$ 127,26 mi em P2 (+8,0%, sendo efeito-preço +R$ 14,43 mi e efeito-volume −R$ 4,99 mi).
   - Sempre explicite na resposta qual das duas métricas foi utilizada.

3. **Períodos Canônicos P1 e P2 (Regra 4.4):**
   - **P1 ( primeiro ano da base ):** `mes_referencia BETWEEN '2022-07' AND '2023-06'`.
   - **P2 ( últimos 12 meses da base ):** `mes_referencia BETWEEN '2025-07' AND '2026-06'`.
   - **"Último ano":** *"perdeu/cresceu no último ano"* é P2 contra P1 (convenção do agente, a mesma da ponte de volume). Compare com os 12 meses imediatamente anteriores (`'2024-07'` a `'2025-06'`) só quando a pergunta pedir. Registre a comparação usada em `premissas`.

4. **Correção de Premissa Falsa:**
   - Se o usuário perguntar *"Quanto a receita comercial cresceu em Jaboatão?"*, corrija educadamente a premissa: de P1 para P2, a receita comercial em `'JABOATÃO DOS GUARARAPES'` **caiu 2,09%** (não cresceu).

---

## 3. Glossário

- **"conta de luz" / "fatura":** `receita_total` (agregado) ou `valor_total` (por UC, com tributos).
- **"inadimplência" / "faturas em aberto":** `valor_em_aberto` em `agg_kpis_mensal` (global) ou `SUM(valor_total)` com `status = 'EM ABERTO'` em `fato_uc_mes` (por recorte).
- **"Jaboatão":** `municipio = 'JABOATÃO DOS GUARARAPES'`.
- **"Poder Público":** `classe = 'PODER PUBLICO'` (sem acento no banco).
- **"menor consumo":** `MIN(consumo_kwh_valido)` com `flag_consumo_negativo = FALSE AND consumo_kwh_valido > 0`.

---

## 4. Exemplos (Pergunta → SQL)

### Exemplo 1: Variação da receita comercial em Jaboatão entre P1 e P2 (premissa falsa)
**Pergunta:** Quanto a receita comercial cresceu em Jaboatão?
```sql
SELECT
    municipio,
    classe,
    SUM(receita_energia_p1) AS receita_energia_p1_brl,
    SUM(receita_energia_p2) AS receita_energia_p2_brl,
    ROUND(((SUM(receita_energia_p2) - SUM(receita_energia_p1)) / NULLIF(SUM(receita_energia_p1), 0)) * 100, 2) AS variacao_pct
FROM agg_preco_volume
WHERE municipio = 'JABOATÃO DOS GUARARAPES'
  AND classe = 'COMERCIAL'
GROUP BY municipio, classe
LIMIT 10;
```

### Exemplo 2: Bairro que mais perdeu volume residencial entre P1 e P2
**Pergunta:** Qual bairro mais perdeu volume residencial no último ano?
```sql
SELECT
    municipio,
    bairro,
    SUM(kwh_p1) AS consumo_p1_kwh,
    SUM(kwh_p2) AS consumo_p2_kwh,
    SUM(kwh_p2 - kwh_p1) AS variacao_volume_kwh
FROM agg_preco_volume
WHERE classe = 'RESIDENCIAL'
GROUP BY municipio, bairro
ORDER BY variacao_volume_kwh ASC
LIMIT 10;
```

### Exemplo 3: Menor consumo válido do mês (protegido contra consumo negativo)
**Pergunta:** Qual foi o menor consumo registrado em junho de 2026?
```sql
SELECT
    id_uc,
    mes_referencia,
    consumo_kwh_valido AS menor_consumo_valido_kwh
FROM fato_uc_mes
WHERE mes_referencia = '2026-06'
  AND flag_consumo_negativo = FALSE
  AND consumo_kwh_valido IS NOT NULL
  AND consumo_kwh_valido > 0
ORDER BY consumo_kwh_valido ASC, id_uc ASC
LIMIT 10;
```

### Exemplo 4: Exceção explícita — casos em que o medidor deu erro com consumo negativo
**Pergunta:** Quais foram os casos em que o medidor deu erro e gerou consumo negativo em 2026-06?
```sql
SELECT
    id_uc,
    id_medidor,
    mes_referencia,
    consumo_kwh AS consumo_bruto_negativo_kwh,
    flag_consumo_negativo
FROM fato_uc_mes
WHERE mes_referencia = '2026-06'
  AND flag_consumo_negativo = TRUE
ORDER BY consumo_kwh ASC
LIMIT 20;
```

### Exemplo 5: Por que a conta de luz / receita aumentou? (Decomposição efeito-preço vs. efeito-volume)
**Pergunta:** Por que a conta de luz aumentou?
```sql
SELECT
    ROUND(SUM(receita_energia_p1), 2) AS receita_energia_p1_brl,
    ROUND(SUM(receita_energia_p2), 2) AS receita_energia_p2_brl,
    ROUND(SUM(variacao_receita), 2) AS variacao_receita_brl,
    ROUND(((SUM(receita_energia_p2) - SUM(receita_energia_p1)) / NULLIF(SUM(receita_energia_p1), 0)) * 100, 2) AS variacao_pct,
    ROUND(SUM(efeito_preco), 2) AS efeito_preco_brl,
    ROUND(SUM(efeito_volume), 2) AS efeito_volume_brl
FROM agg_preco_volume
LIMIT 1;
```
