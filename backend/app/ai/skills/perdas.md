# Skill: Perdas, Fila de Inspeção e Resultado das Inspeções (Gold v2.3)

## 1. Tabelas

### `tb_fila_perdas` (fila atual de UCs com indício de perda, uma linha por UC)
- **Foto de um mês só:** `mes_referencia` é DATE (`DATE '2026-06-01'`), diferente das outras tabelas, que usam texto `'YYYY-MM'`.
- **Colunas principais:**
  - `posicao_fila` (1 = primeira a inspecionar), `id_uc`, `municipio`, `bairro`, `classe`, `alimentador`
  - `score` (0 a 100, prioridade da fila), `acao_recomendada` (`'INSPECAO_PRIORITARIA'` ou `'VALIDACAO_DOCUMENTAL'`), `confianca_evidencia` (`'ALTA'` ou `'MEDIA'`)
  - `motivos` (códigos separados por `|`, ex.: `'QUEDA_SAZONAL_RELEVANTE|QUEDA_ABSOLUTA_RELEVANTE'`), `fatores_atenuantes`
  - `kwh_estimado` (kWh por mês que pode estar sendo perdido, estimativa), `queda_kwh_mensal`, `media_anterior`, `media_atual`
  - `queda_pct` (fração de 0 a 1: `0.46` = queda de 46%; multiplique por 100 para mostrar em %)
  - `possui_gd`, `houve_troca_na_janela`, `ja_inspecionada`, `ultima_inspecao`, `resultado_ultima_inspecao`

### `agg_kpis_mensal` (histórico mensal das inspeções)
- `inspecoes`, `inspecoes_confirmadas`, `taxa_acerto_inspecao` (fração de 0 a 1), `kwh_recuperado`.

---

## 2. Regras de Negócio Obrigatórias

1. **Score não é probabilidade.** Nunca diga "X% de chance de fraude". O score só ordena a fila.
2. **Indício, não culpa.** Fale em "suspeita" ou "indício de perda", nunca chame a UC ou o cliente de fraudador.
3. **`kwh_estimado` é estimativa.** Diga isso na resposta quando usar a coluna.
4. **Motivos:** filtre com `motivos LIKE '%CODIGO%'`, porque uma UC pode ter mais de um motivo.
5. **Taxa de acerto de um período:** `SUM(inspecoes_confirmadas) / SUM(inspecoes)`. Nunca tire média de `taxa_acerto_inspecao` dos meses. Multiplique por 100 para mostrar em %.
6. **Dados pessoais:** a fila não tem nome nem endereço. Identifique a UC só por `id_uc`, bairro e município.

---

## 3. Glossário

- **"gato" / "fraude" / "furto de energia" / "irregularidade" / "perda não técnica":** indício de perda na `tb_fila_perdas`.
- **"fila" / "prioridade" / "quem inspecionar primeiro":** `ORDER BY posicao_fila`.
- **"energia recuperada" / "kWh recuperado":** `agg_kpis_mensal.kwh_recuperado`.
- **"acerto das inspeções":** regra 5.
- **"leitura estimada recorrente":** motivo `'LEITURAS_ESTIMADAS_RECORRENTES'`.

---

## 4. Exemplos (Pergunta → SQL)

### Exemplo 1: Primeiras da fila
**Pergunta:** Quais são as 10 primeiras UCs da fila de inspeção?
```sql
SELECT
    posicao_fila,
    id_uc,
    municipio,
    bairro,
    classe,
    score,
    acao_recomendada,
    confianca_evidencia,
    kwh_estimado AS kwh_estimado_mes
FROM tb_fila_perdas
ORDER BY posicao_fila
LIMIT 10;
```

### Exemplo 2: Fila por município e ação recomendada
**Pergunta:** Quantas UCs da fila há em cada município, por tipo de ação?
```sql
SELECT
    municipio,
    acao_recomendada,
    COUNT(*) AS ucs,
    ROUND(SUM(kwh_estimado), 1) AS kwh_estimado_mes
FROM tb_fila_perdas
GROUP BY municipio, acao_recomendada
ORDER BY ucs DESC
LIMIT 30;
```

### Exemplo 3: UCs com um motivo específico
**Pergunta:** Quais UCs entraram na fila por queda sazonal relevante?
```sql
SELECT
    posicao_fila,
    id_uc,
    municipio,
    bairro,
    motivos,
    ROUND(queda_pct * 100, 1) AS queda_pct
FROM tb_fila_perdas
WHERE motivos LIKE '%QUEDA_SAZONAL_RELEVANTE%'
ORDER BY posicao_fila
LIMIT 20;
```

### Exemplo 4: Taxa de acerto e energia recuperada em um ano
**Pergunta:** Qual foi a taxa de acerto das inspeções em 2025 e quanto foi recuperado?
```sql
SELECT
    SUM(inspecoes) AS inspecoes,
    SUM(inspecoes_confirmadas) AS inspecoes_confirmadas,
    ROUND(SUM(inspecoes_confirmadas)::numeric / NULLIF(SUM(inspecoes), 0) * 100, 2) AS taxa_acerto_pct,
    ROUND(SUM(kwh_recuperado), 1) AS kwh_recuperado
FROM agg_kpis_mensal
WHERE mes_referencia BETWEEN '2025-01' AND '2025-12';
```