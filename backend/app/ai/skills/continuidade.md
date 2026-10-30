# Skill: Continuidade do Fornecimento, DEC/FEC e Interrupções (Gold v2.3)

## 1. Tabelas

### `agg_kpis_mensal` (preferencial para DEC/FEC da distribuidora inteira)
- **Grão:** `mes_referencia` (`YYYY-MM`).
- **Colunas:** `periodo` (`'P1'`, `'P2'` ou NULL), `dec`, `fec`, `dec_sem_dia_critico`, `fec_sem_dia_critico`, `interrupcoes` (contagem oficial do mês), `horas_interrupcao`, `ocorrencias_sobrepostas`, `ocorrencias_teto_48h`, `ocorrencias_dia_critico`, `ucs_atendidas`.

### `agg_dec_fec_mensal` (DEC/FEC por alimentador e mês)
- **Grão:** `alimentador` × `mes_referencia`.
- **Colunas:** `municipio`, `periodo`, `ucs_atendidas`, `interrupcoes`, `ucs_interrompidas`, `horas_interrupcao`, `dec`, `fec`, `dec_sem_dia_critico`, `fec_sem_dia_critico`, `ocorrencias_sobrepostas`, `ocorrencias_teto_48h`, `ocorrencias_acima_24h`, `ocorrencias_dia_critico`.

### `uc_interrupcoes` (uma linha por ocorrência numa UC)
- **Colunas:** `id_ocorrencia`, `id_uc`, `alimentador`, `tipo`, `causa`, `data_abertura` e `data_encerramento` (timestamp), `duracao_min`, `duracao_efetiva_min` (sem tempo sobreposto), `flag_sem_interrupcao`, `flag_antes_ligacao`, `flag_dia_critico`, `flag_duracao_teto`, `flag_sobreposicao`.
- `tipo`: `'FALTA DE ENERGIA'`, `'DANO EM EQUIPAMENTO'`, `'FIO PARTIDO'`, `'OSCILACAO'`, `'SOBRECARGA'`.
- `causa`: `'CLIMATICA'`, `'FALHA DE EQUIPAMENTO'`, `'SOBRECARGA'`, `'TERCEIROS'`, `'VEGETACAO'`, `'NAO IDENTIFICADA'`, `'NAO INFORMADA'`.

### `dim_alimentador` e `fato_alimentador_mes`
- `dim_alimentador`: `alimentador` (ex.: `'ALM-REC-001'`), `municipio`, `bairros_atendidos` (texto com bairros separados por vírgula).
- `fato_alimentador_mes`: `ucs_atendidas` por alimentador e mês.

---

## 2. Regras de Negócio Obrigatórias

1. **DEC/FEC de um período = soma dos meses.** Para P1, P2 ou um ano, some o `dec` (ou `fec`) mensal. Nunca tire média dos meses.
2. **DEC/FEC da distribuidora:** use `agg_kpis_mensal`. Nunca some o `dec` de vários alimentadores no mesmo mês.
3. **DEC/FEC de um município ou grupo de alimentadores:** pondere pelas UCs em cada mês e depois some os meses:
   `SUM(dec * ucs_atendidas) / SUM(ucs_atendidas)` por `mes_referencia`, depois `SUM` desses valores no período.
4. **Dia crítico:** julho de 2025 teve um evento climático extremo (`flag_dia_critico = TRUE`) que concentra boa parte do DEC de P2. Ao comparar P1 com P2, mostre também `dec_sem_dia_critico` e `fec_sem_dia_critico`.
5. **Contar interrupções em `uc_interrupcoes`:** oscilação não é interrupção. Filtre
   `flag_sem_interrupcao = FALSE AND flag_antes_ligacao = FALSE AND duracao_efetiva_min >= 3`
   e use `duracao_efetiva_min` para duração. O total oficial por mês é `agg_kpis_mensal.interrupcoes`.
6. **Mês em `uc_interrupcoes`:** use `TO_CHAR(data_abertura, 'YYYY-MM')`. `periodo` é NULL fora de P1 e P2, então para outros intervalos filtre por `mes_referencia`.

---

## 3. Glossário

- **"falta de luz" / "queda de energia" / "apagão" / "ficou sem energia":** interrupção.
- **"DEC":** horas médias sem energia por UC no período.
- **"FEC":** número médio de interrupções por UC no período.
- **"dia crítico" / "evento climático de julho de 2025":** `flag_dia_critico = TRUE`; colunas `*_sem_dia_critico`.
- **"chuva" / "tempestade":** `causa = 'CLIMATICA'`. **"árvore" / "galho":** `causa = 'VEGETACAO'`.
- **"P1"** = `'2022-07'` a `'2023-06'`; **"P2"** = `'2025-07'` a `'2026-06'`.

---

## 4. Exemplos (Pergunta → SQL)

### Exemplo 1: DEC e FEC de P1 e P2, com e sem dia crítico
**Pergunta:** Como o DEC e o FEC mudaram entre P1 e P2?
```sql
SELECT
    periodo,
    ROUND(SUM(dec), 4) AS dec_horas,
    ROUND(SUM(fec), 4) AS fec_vezes,
    ROUND(SUM(dec_sem_dia_critico), 4) AS dec_sem_dia_critico_horas,
    ROUND(SUM(fec_sem_dia_critico), 4) AS fec_sem_dia_critico_vezes
FROM agg_kpis_mensal
WHERE periodo IN ('P1', 'P2')
GROUP BY periodo
ORDER BY periodo;
```

### Exemplo 2: Municípios com maior DEC em P2
**Pergunta:** Quais municípios tiveram o maior DEC nos últimos 12 meses?
```sql
WITH dec_mensal AS (
    SELECT
        municipio,
        mes_referencia,
        SUM(dec * ucs_atendidas) / NULLIF(SUM(ucs_atendidas), 0) AS dec_mes
    FROM agg_dec_fec_mensal
    WHERE mes_referencia BETWEEN '2025-07' AND '2026-06'
    GROUP BY municipio, mes_referencia
)
SELECT
    municipio,
    ROUND(SUM(dec_mes), 4) AS dec_p2_horas
FROM dec_mensal
GROUP BY municipio
ORDER BY dec_p2_horas DESC
LIMIT 10;
```

### Exemplo 3: Principais causas de interrupção em um ano
**Pergunta:** Quais foram as principais causas de falta de luz em 2025?
```sql
SELECT
    causa,
    COUNT(*) AS interrupcoes,
    ROUND(SUM(duracao_efetiva_min) / 60.0, 1) AS horas_interrupcao
FROM uc_interrupcoes
WHERE TO_CHAR(data_abertura, 'YYYY') = '2025'
  AND flag_sem_interrupcao = FALSE
  AND flag_antes_ligacao = FALSE
  AND duracao_efetiva_min >= 3
GROUP BY causa
ORDER BY interrupcoes DESC;
```

### Exemplo 4: Alimentadores com mais horas de interrupção em P2
**Pergunta:** Quais alimentadores mais tiveram falta de luz em P2?
```sql
SELECT
    alimentador,
    municipio,
    SUM(interrupcoes) AS interrupcoes,
    ROUND(SUM(horas_interrupcao), 1) AS horas_interrupcao,
    ROUND(SUM(dec), 4) AS dec_horas
FROM agg_dec_fec_mensal
WHERE periodo = 'P2'
GROUP BY alimentador, municipio
ORDER BY horas_interrupcao DESC
LIMIT 10;
```