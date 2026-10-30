# Skill: Atendimento ao Cliente, Canais e Satisfação (Gold v2.3)

## 1. Tabelas

### `uc_atendimentos` (uma linha por protocolo)
- **Colunas:** `protocolo`, `id_uc`, `canal`, `assunto`, `subassunto`, `data_abertura` e `data_fechamento` (timestamp, de julho de 2022 a junho de 2026), `nota_satisfacao` (1 a 5, NULL quando o cliente não avaliou), `tempo_atendimento_h` (horas entre abertura e fechamento).
- `canal`: `'APP'`, `'PRESENCIAL'`, `'SITE'`, `'TELEFONE'`, `'WHATSAPP'`.
- `assunto` → `subassunto`:
  - `'FALTA DE ENERGIA'` → `'INTERRUPCAO PARCIAL'`, `'INTERRUPCAO TOTAL'`, `'OSCILACAO'`
  - `'FATURA'` → `'CONTESTACAO'`, `'PARCELAMENTO'`, `'SEGUNDA VIA'`, `'VALOR ALTO'`
  - `'DANO ELETRICO'` → `'RESSARCIMENTO'`, `'VISTORIA'`
  - `'GERACAO DISTRIBUIDA'` → `'CREDITOS'`, `'HOMOLOGACAO'`, `'VISTORIA'`
  - `'LIGACAO NOVA'` → `'PRAZO'`, `'SOLICITACAO'`, `'VISTORIA'`
  - `'RELIGACAO'` → `'APOS PAGAMENTO'`, `'URGENCIA'`
- Para `municipio`, `bairro` ou `classe`, fazer JOIN com `dim_uc` por `id_uc`.

### `agg_kpis_mensal`
- `atendimentos` (protocolos abertos no mês) e `satisfacao_media` (média do mês).

---

## 2. Regras de Negócio Obrigatórias

1. **Assunto não descreve a UC.** Um chamado de `'GERACAO DISTRIBUIDA'` não quer dizer que a UC tem painel solar. Para GD use `dim_uc.flag_tem_gd`.
2. **Nota de satisfação:** nem todo protocolo foi avaliado. Use `AVG(nota_satisfacao)` (ignora NULL) e diga "entre os atendimentos avaliados".
3. **Média de um período:** calcule a partir de `uc_atendimentos`. Nunca tire média de `satisfacao_media` mensal.
4. **Mês e período:** use `TO_CHAR(data_abertura, 'YYYY-MM')`. P1 = `'2022-07'` a `'2023-06'`; P2 = `'2025-07'` a `'2026-06'`.
5. **Tempo de atendimento** está em horas. Converta para dias (÷ 24) só se o usuário pedir.

---

## 3. Glossário

- **"chamado" / "reclamação" / "protocolo" / "atendimento":** uma linha de `uc_atendimentos`.
- **"call center" / "ligação":** `canal = 'TELEFONE'`. **"zap":** `canal = 'WHATSAPP'`. **"loja" / "agência":** `canal = 'PRESENCIAL'`.
- **"satisfação" / "nota" / "avaliação":** `nota_satisfacao`.
- **"conta veio alta" (como reclamação):** `assunto = 'FATURA' AND subassunto = 'VALOR ALTO'`.
- **"tempo de resposta" / "demora":** `tempo_atendimento_h`.

---

## 4. Exemplos (Pergunta → SQL)

### Exemplo 1: Atendimentos por canal em P2
**Pergunta:** Quantos atendimentos teve cada canal nos últimos 12 meses?
```sql
SELECT
    canal,
    COUNT(*) AS atendimentos
FROM uc_atendimentos
WHERE TO_CHAR(data_abertura, 'YYYY-MM') BETWEEN '2025-07' AND '2026-06'
GROUP BY canal
ORDER BY atendimentos DESC;
```

### Exemplo 2: Satisfação e tempo médio por assunto
**Pergunta:** Qual assunto tem a pior nota de satisfação?
```sql
SELECT
    assunto,
    ROUND(AVG(nota_satisfacao), 2) AS nota_media_avaliados,
    COUNT(nota_satisfacao) AS atendimentos_avaliados,
    ROUND(AVG(tempo_atendimento_h), 1) AS tempo_medio_h
FROM uc_atendimentos
GROUP BY assunto
ORDER BY nota_media_avaliados ASC;
```

### Exemplo 3: Reclamações de conta alta por município em um ano
**Pergunta:** Onde mais reclamaram de conta alta em 2025?
```sql
SELECT
    u.municipio,
    COUNT(*) AS reclamacoes_valor_alto
FROM uc_atendimentos a
JOIN dim_uc u ON u.id_uc = a.id_uc
WHERE a.assunto = 'FATURA'
  AND a.subassunto = 'VALOR ALTO'
  AND TO_CHAR(a.data_abertura, 'YYYY') = '2025'
GROUP BY u.municipio
ORDER BY reclamacoes_valor_alto DESC
LIMIT 10;
```

### Exemplo 4: Chamados de falta de energia mês a mês
**Pergunta:** Como evoluíram os chamados de falta de energia em 2025?
```sql
SELECT
    TO_CHAR(data_abertura, 'YYYY-MM') AS mes_referencia,
    COUNT(*) AS chamados
FROM uc_atendimentos
WHERE assunto = 'FALTA DE ENERGIA'
  AND TO_CHAR(data_abertura, 'YYYY') = '2025'
GROUP BY 1
ORDER BY 1;
```