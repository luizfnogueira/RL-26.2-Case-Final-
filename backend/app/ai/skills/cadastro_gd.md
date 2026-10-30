# Skill: Cadastro das UCs, Medidores e Geração Distribuída (Gold v2.3)

## 1. Tabelas

### `dim_uc` (uma linha por UC)
- **Localização e classe:** `id_uc` (ex.: `'UC100000'`), `municipio`, `bairro`, `uf`, `alimentador`, `classe`, `subgrupo_tarifario`, `status` (`'ATIVA'`), `data_ligacao`.
- **Classe × subgrupo:** `'RESIDENCIAL'` = `'B1'`, `'RURAL'` = `'B2'`, `'COMERCIAL'` e `'PODER PUBLICO'` = `'B3'`, `'INDUSTRIAL'` = `'A4'`.
- **Medidor atual:** `id_medidor`, `tipo_medidor` (`'ELETROMECANICO'`, `'ELETRONICO'`, `'SMART'`), `modelo_medidor`, `data_instalacao_medidor`, `flag_trocou_medidor`.
- **Geração distribuída (GD):** `flag_tem_gd`, `gd_modalidade` (`'GERACAO NA PROPRIA UC'`, `'AUTOCONSUMO REMOTO'`, `'GERACAO COMPARTILHADA'`, NULL sem GD), `gd_potencia_kwp`, `gd_data_conexao`, `gd_energia_injetada_kwh_media_mensal`, `flag_potencia_escala_suspeita`.
- **Flags de qualidade do cadastro:** `flag_data_ligacao_suspeita`, `flag_documento_classe_inconsistente`, `flag_classe_subgrupo_inconsistente`, `flag_alimentador_municipio_inconsistente`.

### `dim_alimentador`
- `alimentador` (ex.: `'ALM-REC-001'`), `municipio`, `bairros_atendidos` (bairros separados por vírgula, ex.: `'CAETÉS I, CAETÉS II, CENTRO'`).

---

## 2. Regras de Negócio Obrigatórias

1. **Contar UCs:** `COUNT(*)` em `dim_uc` (uma linha por UC). "Clientes" e "unidades" significam UCs.
2. **Potência de GD:** ao somar ou tirar média de `gd_potencia_kwp`, exclua `flag_potencia_escala_suspeita = TRUE` (potência provavelmente cadastrada na unidade errada) e diga quantas UCs ficaram de fora.
3. **GD e consumo:** todas as conexões de GD são de 2024 em diante, depois de P1. Uma queda de consumo dessas UCs entre P1 e P2 pode ser só a energia que elas passaram a gerar. Mencione isso quando cruzar GD com consumo.
4. **Energia injetada:** `gd_energia_injetada_kwh_media_mensal` é média por mês, não total.
5. **Dados pessoais:** nome do titular, CPF/CNPJ, endereço e coordenadas não existem nesta tabela. Não tente buscá-los.
6. **Bairros de um alimentador:** filtre `bairros_atendidos LIKE '%NOME DO BAIRRO%'`. Para saber o alimentador de uma UC, use `dim_uc.alimentador`.

---

## 3. Glossário

- **"painel solar" / "energia solar" / "GD" / "microgeração":** `flag_tem_gd = TRUE`.
- **"potência instalada":** `gd_potencia_kwp` (kWp).
- **"medidor inteligente":** `tipo_medidor = 'SMART'`. **"medidor antigo" / "relógio de disco":** `'ELETROMECANICO'`.
- **"trocou o medidor":** `flag_trocou_medidor = TRUE`.
- **"grupo A" / "alta tensão":** `subgrupo_tarifario = 'A4'`. **"grupo B" / "baixa tensão":** `'B1'`, `'B2'`, `'B3'`.

---

## 4. Exemplos (Pergunta → SQL)

### Exemplo 1: UCs com GD por município
**Pergunta:** Quantas unidades têm painel solar em cada município?
```sql
SELECT
    municipio,
    COUNT(*) FILTER (WHERE flag_tem_gd = TRUE) AS ucs_com_gd,
    COUNT(*) AS ucs_total,
    ROUND(COUNT(*) FILTER (WHERE flag_tem_gd = TRUE)::numeric / COUNT(*) * 100, 2) AS pct_com_gd
FROM dim_uc
GROUP BY municipio
ORDER BY ucs_com_gd DESC;
```

### Exemplo 2: Potência instalada por modalidade, sem as potências suspeitas
**Pergunta:** Qual a potência instalada de GD por modalidade?
```sql
SELECT
    gd_modalidade,
    COUNT(*) AS ucs_com_gd,
    ROUND(SUM(gd_potencia_kwp), 1) AS potencia_kwp,
    ROUND(AVG(gd_potencia_kwp), 2) AS potencia_media_kwp,
    (SELECT COUNT(*) FROM dim_uc WHERE flag_tem_gd = TRUE AND flag_potencia_escala_suspeita = TRUE) AS ucs_excluidas_por_escala
FROM dim_uc
WHERE flag_tem_gd = TRUE
  AND flag_potencia_escala_suspeita = FALSE
GROUP BY gd_modalidade
ORDER BY potencia_kwp DESC;
```

### Exemplo 3: Tipos de medidor em um município
**Pergunta:** Quantos medidores inteligentes tem em Olinda?
```sql
SELECT
    tipo_medidor,
    COUNT(*) AS ucs
FROM dim_uc
WHERE municipio = 'OLINDA'
GROUP BY tipo_medidor
ORDER BY ucs DESC;
```

### Exemplo 4: Alimentadores que atendem um bairro
**Pergunta:** Quais alimentadores atendem o bairro Boa Viagem?
```sql
SELECT
    d.alimentador,
    d.municipio,
    COUNT(u.id_uc) AS ucs_do_bairro_no_alimentador
FROM dim_alimentador d
LEFT JOIN dim_uc u
       ON u.alimentador = d.alimentador
      AND u.bairro = 'BOA VIAGEM'
WHERE d.bairros_atendidos LIKE '%BOA VIAGEM%'
GROUP BY d.alimentador, d.municipio
ORDER BY ucs_do_bairro_no_alimentador DESC;
```