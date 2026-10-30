# Skill: Consumo, Queda de Consumo e Conta Alta (Gold v2.3)

## 1. Tabelas

### `fato_uc_mes` (consumo de cada UC em cada mês)
- **Grão:** `id_uc` × `mes_referencia` (`YYYY-MM`, de `'2022-07'` a `'2026-06'`). Para `municipio`, `bairro`, `classe` ou GD, fazer JOIN com `dim_uc` por `id_uc`.
- **Colunas de consumo:** `consumo_kwh_valido` (kWh canônico, usar sempre), `consumo_kwh` (bruto, pode ser negativo), `tipo_leitura` (`'REAL'` ou `'ESTIMADA'`), `flag_leitura_estimada`, `flag_consumo_negativo`.

### `uc_consumo_comparativo` (cada mês contra o mesmo mês do ano anterior)
- **Grão:** `id_uc` × `mes_referencia`.
- **Colunas:** `consumo_kwh` (já é o válido), `consumo_kwh_ano_anterior` (NULL de `'2022-07'` a `'2023-06'`, porque não há ano anterior), `variacao_pct` (em %, ex.: `-35.2`), `tipo_leitura`, `flag_conta_alta`.

### `agg_receita_mensal` (consumo agregado por mês × município × bairro × classe)
- `consumo_kwh` já é a soma de `consumo_kwh_valido`. Preferir esta tabela para totais por recorte: é muito mais rápida que `fato_uc_mes`.

### `agg_kpis_mensal` (um registro por mês)
- `consumo_kwh` (total do mês), `faturas`, `leituras_estimadas`, `periodo` (`'P1'`, `'P2'` ou NULL nos meses fora deles).

---

## 2. Regras de Negócio Obrigatórias

1. **Consumo negativo:** em toda consulta normal use `consumo_kwh_valido` com
   `flag_consumo_negativo = FALSE AND consumo_kwh_valido IS NOT NULL AND consumo_kwh_valido >= 0`.
   Em `uc_consumo_comparativo`, filtre `consumo_kwh >= 0` e, em comparações percentuais, `consumo_kwh_ano_anterior > 0`.
   Só consulte `flag_consumo_negativo = TRUE` se o usuário pedir explicitamente os casos de erro de medidor.

2. **"Queda de consumo" de uma UC (definição padrão):** compare o consumo total da UC em P2 com o de P1.
   - P1 = `'2022-07'` a `'2023-06'`; P2 = `'2025-07'` a `'2026-06'`.
   - Variação % = `(consumo_p2 - consumo_p1) / consumo_p1 * 100`. "Queda acima de 30%" = variação `< -30`.
   - Considere só UCs com consumo nos dois períodos (`consumo_p1 > 0` e `consumo_p2` não nulo).
   - Diga na resposta qual comparação foi usada.
   - Se a pergunta falar em "último ano" ou "últimos 12 meses", compare P2 com `'2024-07'` a `'2025-06'`.
   - Se pedir "em algum mês" ou "mês a mês", use `variacao_pct` de `uc_consumo_comparativo`.

3. **Conta alta:** `flag_conta_alta = TRUE` em `uc_consumo_comparativo` (consumo mais de 20% acima do mesmo mês do ano anterior). Não existe conta alta antes de `'2023-07'`.

4. **Leitura estimada:** `tipo_leitura = 'ESTIMADA'` (ou `flag_leitura_estimada = TRUE`). O percentual de leituras estimadas de um mês é `leituras_estimadas / faturas` em `agg_kpis_mensal`.

5. **Unidade:** responda em kWh. Converta para MWh (÷ 1.000) ou GWh (÷ 1.000.000) só se o usuário pedir.

---

## 3. Glossário

- **"consumo" / "volume" / "energia faturada":** kWh (`consumo_kwh_valido` ou `consumo_kwh` das tabelas agregadas).
- **"painel solar" / "energia solar" / "GD":** `dim_uc.flag_tem_gd = TRUE`.
- **"queda de consumo":** regra 2 acima.
- **"conta alta" / "conta veio alta":** `flag_conta_alta = TRUE`.
- **"leitura estimada" / "leitura pela média":** `tipo_leitura = 'ESTIMADA'`.
- **"cliente" / "unidade" / "UC":** uma linha de `dim_uc` (`id_uc`).

---

## 4. Exemplos (Pergunta → SQL)

### Exemplo 1: UCs com GD em um município com queda de consumo acima de um limite
**Pergunta:** Quantas unidades com painel solar em Paulista tiveram queda de consumo acima de 50%?
```sql
WITH consumo_por_uc AS (
    SELECT
        f.id_uc,
        SUM(f.consumo_kwh_valido) FILTER (WHERE f.mes_referencia BETWEEN '2022-07' AND '2023-06') AS consumo_p1_kwh,
        SUM(f.consumo_kwh_valido) FILTER (WHERE f.mes_referencia BETWEEN '2025-07' AND '2026-06') AS consumo_p2_kwh
    FROM fato_uc_mes f
    JOIN dim_uc u ON u.id_uc = f.id_uc
    WHERE u.flag_tem_gd = TRUE
      AND u.municipio = 'PAULISTA'
      AND f.flag_consumo_negativo = FALSE
      AND f.consumo_kwh_valido IS NOT NULL
      AND f.consumo_kwh_valido >= 0
    GROUP BY f.id_uc
)
SELECT
    COUNT(*) FILTER (WHERE (consumo_p2_kwh - consumo_p1_kwh) / consumo_p1_kwh * 100 < -50) AS ucs_com_queda,
    COUNT(*) AS ucs_comparaveis
FROM consumo_por_uc
WHERE consumo_p1_kwh > 0
  AND consumo_p2_kwh IS NOT NULL;
```

### Exemplo 2: Contas altas por município em um mês
**Pergunta:** Quantas contas altas teve cada município em junho de 2026?
```sql
SELECT
    u.municipio,
    COUNT(*) AS contas_altas
FROM uc_consumo_comparativo c
JOIN dim_uc u ON u.id_uc = c.id_uc
WHERE c.mes_referencia = '2026-06'
  AND c.flag_conta_alta = TRUE
  AND c.consumo_kwh >= 0
GROUP BY u.municipio
ORDER BY contas_altas DESC
LIMIT 20;
```

### Exemplo 3: Consumo por classe em P2
**Pergunta:** Qual foi o consumo de cada classe nos últimos 12 meses da base?
```sql
SELECT
    classe,
    SUM(consumo_kwh) AS consumo_kwh
FROM agg_receita_mensal
WHERE mes_referencia BETWEEN '2025-07' AND '2026-06'
GROUP BY classe
ORDER BY consumo_kwh DESC;
```

### Exemplo 4: Percentual de leituras estimadas por mês
**Pergunta:** Qual o percentual de leituras estimadas em cada mês de 2026?
```sql
SELECT
    mes_referencia,
    leituras_estimadas,
    faturas,
    ROUND(leituras_estimadas::numeric / NULLIF(faturas, 0) * 100, 2) AS pct_leituras_estimadas
FROM agg_kpis_mensal
WHERE mes_referencia BETWEEN '2026-01' AND '2026-06'
ORDER BY mes_referencia;
```