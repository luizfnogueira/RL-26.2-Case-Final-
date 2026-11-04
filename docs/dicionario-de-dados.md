# Dicionário de Dados da Camada Gold

As 14 tabelas que o pipeline do Databricks exporta para o PostgreSQL (schema `gold`) e que alimentam o portal e o agente de IA. Para cada tabela: o grão, o notebook que a gera, a definição de cada coluna e **as decisões de limpeza que afetam cada métrica**.

- **Tipos e chaves (contrato):** [`backend/app/db/gold_contract.py`](../backend/app/db/gold_contract.py) e [`backend/app/db/gold_columns.json`](../backend/app/db/gold_columns.json).
- **Pipeline:** [`data-engineering/v_energy_pipeline.yml`](../data-engineering/v_energy_pipeline.yml). As regras completas estão nas células de texto de cada notebook.
- **Convenções:**
  - `mes_referencia` é texto `AAAA-MM` (a competência da fatura ou da leitura).
  - **P1** = 2022-07 a 2023-06 (primeiro ano da base); **P2** = 2025-07 a 2026-06 (últimos 12 meses).
  - Valores em R$ e kWh são `decimal`, sem arredondamento intermediário.
  - Toda tabela tem `_atualizado_em`, o momento em que o Databricks gravou a tabela.
  - **Nulo é "não se sabe", nunca zero.**

## Princípios que valem para todas as métricas

1. **Uma métrica, um lugar.** O kWh válido, o Cc do DEC/FEC e os períodos P1/P2 são definidos uma vez só no `gold_base`; as outras Gold leem dali.
2. **A Silver não apaga nem corrige sem evidência.** Cada problema de dado é corrigido (quando há regra exata), vai para a quarentena com o motivo ou vira uma `flag_*`. A Gold decide, e documenta aqui, quais flags tiram a linha de cada métrica.
3. **Checagens antes de gravar.** Em todos os notebooks Gold, antes de gravar, são conferidos:
   - grão único e chaves sem nulos;
   - UC existente na `dim_uc`;
   - reconciliação com a Silver (receita, número de faturas e kWh);
   - CPF/CNPJ sem máscara (barrado).

   Se algo falhar, nada é gravado.
4. **LGPD.** `cpf_cnpj` chega à Gold só com os dígitos do meio: `***.456.789-**` ou `**.345.678/0001-**`. O exportador confere de novo antes de gerar os CSVs.

## Decisões de limpeza (Silver) que afetam as métricas da Gold

| Decisão | Notebook | Métricas afetadas |
| :--- | :--- | :--- |
| 200 UCs de teste (`TESTE…`) e duplicatas do cadastro vão para a quarentena; 59 bairros com encoding quebrado (UTF-8 lido como Latin-1) são corrigidos. | `silver_cadastro` | Tudo que agrupa por UC, bairro ou município |
| Data de ligação antes de 1950 (sempre 1º/jan, 90 UCs) vira nula e ganha `flag_data_ligacao_suspeita`. | `silver_cadastro` | `ucs_atendidas` (Cc): a UC sem data conta desde o início |
| As 32.285 faturas órfãs (sem UC no cadastro) eram cópias exatas de faturas válidas e vão para a quarentena. | `silver_faturamento` | Receita, faturas e inadimplência: nenhuma receita real se perde |
| Datas em 4 formatos e valores com "R$" são padronizados. O formato mês-dia foi provado porque vencimento = emissão + 12 dias em 100% dos casos. | `silver_faturamento` | `mes_referencia`, vencimento e receita |
| `data_pagamento = 9999-12-31` é uma data-sentinela de "sem pagamento" e vira nula; a fatura continua **EM ABERTO** (marcá-la como paga mudaria 61 mil faturas). | `silver_faturamento` | `faturas_em_aberto`, `valor_em_aberto` e `inadimplencia` |
| Cerca de 6,2 mil consumos negativos eram a 1ª leitura depois de uma troca de medidor: consumo = `leitura_atual` (≈ 2,4 GWh recuperados), com `flag_primeira_leitura_pos_troca`. O sinal invertido só é corrigido quando os dois ponteiros provam o valor. | `silver_medicao` | Todo kWh (`consumo_kwh_valido`) |
| Os ~30 negativos sem explicação ficam na Silver com `flag_consumo_negativo` e **saem das somas** (`consumo_kwh_valido` nulo), conforme a reunião de 21/10. | `silver_medicao` → `gold_base` | Todo kWh, a tarifa média e o efeito-volume |
| A potência de GD suspeita de escala ×1000 (35 UCs) ganha `flag_potencia_escala_suspeita` e **não é dividida**. | `silver_perdas` | `gd_potencia_kwp` (somas de potência devem filtrar a flag) |
| Inspeções: 1.389 linhas válidas (3 abas unidas). | `silver_perdas` | `inspecoes`, `taxa_acerto_inspecao` e `kwh_recuperado` |
| Duração com texto (" min") é convertida; `duracao_efetiva_min` desconta o tempo já sobreposto; causa vazia vira "NÃO INFORMADA" (≠ "NÃO IDENTIFICADA"). | `silver_rede_atendimento` | `dec`, `horas_interrupcao` e análise por causa |
| Dia crítico = dia com interrupções acima da média + 3 desvios (os 31 dias de julho/2025). | `silver_rede_atendimento` | `dec_sem_dia_critico` e `fec_sem_dia_critico` |
| Nota de satisfação não respondida continua nula (9.566), nunca vira zero. | `silver_rede_atendimento` | `satisfacao_media` |

---

## 1. `dim_mes` (1 linha por mês, 48 linhas) · `gold_base`

| Coluna | Definição |
| :--- | :--- |
| `mes_referencia` | Mês `AAAA-MM`, gerado do primeiro ao último mês faturado (jul/2022 a jun/2026), sem buracos. |
| `ano`, `mes`, `trimestre` | Partes do mês. |
| `periodo` | `P1`, `P2` ou nulo (meses fora dos dois períodos comparados). |
| `bandeira_tarifaria` | Bandeira do mês (`VERDE`, `AMARELA`, `VERMELHA P1`, `VERMELHA P2`). O notebook falha se um mês tiver duas bandeiras. |

## 2. `dim_uc` (1 linha por UC, 45.000 linhas) · `gold_base`

| Coluna | Definição e decisões |
| :--- | :--- |
| `id_uc` | Código da UC (chave). |
| `cpf_cnpj` | Documento **mascarado** (LGPD). |
| `nome_titular`, `logradouro`, `numero`, `bairro`, `municipio`, `uf`, `cep` | Cadastro limpo. O bairro tem o encoding corrigido; o CEP inválido vira nulo. **O agente de IA não acessa os dados pessoais.** |
| `classe`, `subgrupo_tarifario` | Classe de consumo e subgrupo (B1, B2, B3 e A4). |
| `alimentador` | Circuito que atende a UC. |
| `data_ligacao` | Data de ligação; nula quando suspeita (antes de 1950). |
| `status` | Situação da UC. |
| `latitude`, `longitude` | Coordenadas. |
| `id_medidor`, `tipo_medidor`, `modelo_medidor`, `data_instalacao_medidor` | **Medidor ativo** (exatamente 1 por UC; o notebook falha se houver 2). |
| `flag_trocou_medidor` | A UC teve mais de um medidor no histórico. |
| `flag_tem_gd` | A UC tem geração distribuída. |
| `gd_potencia_kwp`, `gd_modalidade`, `gd_data_conexao`, `gd_energia_injetada_kwh_media_mensal` | Dados da GD (nulos sem GD). |
| `flag_potencia_escala_suspeita` | Potência incompatível com a energia injetada (possível ×1000). |
| `flag_data_ligacao_suspeita` | Data de ligação antes de 1950 (anulada). |
| `flag_documento_classe_inconsistente` | Classe incompatível com CPF ou CNPJ. |
| `flag_classe_subgrupo_inconsistente` | Subgrupo incompatível com a classe. |
| `flag_alimentador_municipio_inconsistente` | Alimentador de outro município. |

## 3. `dim_alimentador` (1 linha por alimentador, 122 linhas) · `gold_base`

| Coluna | Definição |
| :--- | :--- |
| `alimentador` | Código do circuito (chave). |
| `municipio` | Município do alimentador (o notebook falha se houver dois). |
| `bairros_atendidos` | Bairros das UCs ligadas a ele, em ordem alfabética, separados por vírgula. |

## 4. `fato_alimentador_mes` (alimentador × mês) · `gold_base`

| Coluna | Definição e decisões |
| :--- | :--- |
| `ucs_atendidas` | **Cc do DEC/FEC:** UCs do alimentador **ligadas até o fim do mês** (`data_ligacao <= último dia do mês`). A UC sem data de ligação conta desde o início. A grade é completa (122 × 48), e o notebook falha se algum Cc for zero. Uma UC ligada em 2025 não entra no Cc de 2022. |

## 5. `fato_uc_mes` (UC × mês, ≈ 2,15 mi linhas) · `gold_base`

A fatura do mês com a leitura da mesma UC e mês (left join; o notebook falha se sobrar leitura sem fatura).

| Coluna | Definição e decisões |
| :--- | :--- |
| `id_fatura`, `data_emissao`, `data_vencimento`, `data_pagamento`, `status` | Fatura (status `PAGA` ou `EM ABERTO`). A data-sentinela 9999-12-31 virou nula. |
| `valor_energia` | Valor da energia **sem tributos** (base da ponte da receita). |
| `tributos`, `valor_total` | Tributos e total faturado (`valor_total` = energia + tributos). |
| `bandeira_tarifaria` | Bandeira da fatura. |
| `id_leitura`, `id_medidor`, `data_leitura`, `leitura_anterior`, `leitura_atual`, `tipo_leitura` | Leitura do mês. |
| `consumo_kwh` | Consumo apurado na Silver, já com as correções da 1ª leitura pós-troca e do sinal invertido. Pode ser negativo nos ~30 casos sem explicação. **Fica para auditoria; não é somado.** |
| **`consumo_kwh_valido`** | **O kWh oficial de todas as Gold:** `consumo_kwh` quando `flag_consumo_negativo` é falsa; **nulo** nos negativos sem explicação. O `gold_base` confere que Σ válido = Σ consumo − Σ negativos. |
| `flag_total_inconsistente` | `valor_total ≠ valor_energia + tributos` (0 casos hoje). |
| `flag_status_pagamento_inconsistente` | PAGA sem data ou EM ABERTO com data. |
| `flag_primeira_leitura_pos_troca` | 1ª leitura até 45 dias depois da troca de medidor (consumo recuperado pela `leitura_atual`). |
| `flag_leitura_anterior_ausente` | Sem leitura anterior (1ª leitura do medidor ou valor ausente). |
| `flag_leitura_estimada` | Leitura por estimativa ou média (`ESTIMADA` ou `MEDIA`). |
| `flag_consumo_negativo` | Consumo negativo que a Silver não conseguiu explicar (fora das somas). |
| `flag_consumo_inconsistente` | Consumo diferente de `leitura_atual − leitura_anterior` além da tolerância. |

## 6. `agg_receita_mensal` (mês × município × bairro × classe) · `gold_receita`

| Coluna | Definição |
| :--- | :--- |
| `receita_total` | Σ `valor_total` (com tributos): a **receita faturada**. |
| `receita_energia` | Σ `valor_energia` (sem tributos). |
| `tributos` | Σ `tributos`. |
| `consumo_kwh` | Σ **`consumo_kwh_valido`**. |
| `faturas` | Número de faturas. |
| `tarifa_media` | `receita_energia ÷ consumo_kwh` (R$/kWh, sem tributos; nula se o kWh for 0). Para um recorte maior, recalcule como Σ receita ÷ Σ kWh; nunca tire a média das tarifas. |

## 7. `agg_preco_volume` (município × bairro × classe; P1 × P2) · `gold_receita`

A ponte da receita do diagnóstico. Fecha sem resíduo (o notebook confere): **receita P1 + efeito-preço + efeito-volume = receita P2**.

| Coluna | Definição |
| :--- | :--- |
| `receita_energia_p1`, `receita_energia_p2` | Σ `valor_energia` em P1 e em P2. |
| `kwh_p1`, `kwh_p2` | Σ `consumo_kwh_valido` em P1 e em P2. |
| `tarifa_p1`, `tarifa_p2` | Receita de energia ÷ kWh de cada período. |
| `variacao_receita` | `receita_energia_p2 − receita_energia_p1`. |
| **`efeito_volume`** | `(kwh_p2 − kwh_p1) × tarifa_p1`: quanto a receita mudaria só pela variação do volume, a preço de P1. Segmento sem P1 usa `tarifa_p2`. |
| **`efeito_preco`** | `variacao_receita − efeito_volume` = `(tarifa_p2 − tarifa_p1) × kwh_p2`. Inclui o reajuste **e as bandeiras tarifárias** (e o mix dentro do segmento). |

Usa a receita **sem tributos**, porque o tributo não é preço nem volume. A receita faturada (com tributos) fica em `agg_kpis_mensal` e `agg_receita_mensal`.

## 8. `agg_kpis_mensal` (1 linha por mês, 48 linhas) · `gold_kpis`

| Coluna | Definição e decisões |
| :--- | :--- |
| `periodo`, `bandeira_tarifaria`, `ano`, `mes`, `trimestre` | Da `dim_mes`. |
| `ucs_atendidas` | Σ do Cc dos alimentadores no mês. |
| `faturas`, `receita_total`, `receita_energia`, `tributos`, `consumo_kwh`, `tarifa_media` | As mesmas regras do `agg_receita_mensal`, somadas no mês (kWh = `consumo_kwh_valido`). |
| `faturas_em_aberto`, `valor_em_aberto` | Faturas da competência com `status = 'EM ABERTO'` e o seu `valor_total`. |
| `inadimplencia` | `valor_em_aberto ÷ receita_total` do mês. Como todas as faturas em aberto já estão vencidas no fim da base, equivale ao valor em aberto (README, premissa 2). |
| `leituras_estimadas` | Leituras com `flag_leitura_estimada` (contadas à parte; o kWh delas entra no consumo). |
| `interrupcoes`, `horas_interrupcao`, `dec`, `fec`, `dec_sem_dia_critico`, `fec_sem_dia_critico` | Mesmas regras do `agg_dec_fec_mensal` (abaixo), com o Cc da empresa inteira no mês. |
| `ocorrencias_sobrepostas`, `ocorrencias_teto_48h`, `ocorrencias_dia_critico` | Contagem das flags da Silver, para transparência. |
| `atendimentos` | Protocolos abertos no mês. |
| `satisfacao_media` | Média de `nota_satisfacao` **só entre os avaliados** (nulos ignorados, nunca zero). Para um período, recalcule em `uc_atendimentos`; nunca tire a média das médias mensais. |
| `inspecoes`, `inspecoes_confirmadas` | Inspeções do mês e as que confirmaram irregularidade (`IRREGULARIDADE CONFIRMADA`). |
| `taxa_acerto_inspecao` | `inspecoes_confirmadas ÷ inspecoes` (nula em mês sem inspeção). |
| `kwh_recuperado` | Σ kWh recuperado informado nas inspeções (0 em mês sem inspeção). |

## 9. `agg_dec_fec_mensal` (alimentador × mês, 122 × 48) · `gold_dec_fec`

**Fórmula (PRODIST, Módulo 8):** DEC = Σ t(i) ÷ Cc e FEC = Σ Ca(i) ÷ Cc. Cada ocorrência da base é uma UC interrompida, então Ca(i) = 1 e t(i) = `duracao_efetiva_min ÷ 60`. Cc = `ucs_atendidas` do alimentador **no mês**.

**O que conta como interrupção:**
- **Entra:** duração ≥ 3 min (interrupção longa).
- **Sai do cálculo** (mas continua na Silver e em `uc_interrupcoes`):
  - `OSCILACAO` (`flag_sem_interrupcao`, 14.562): variação de tensão, a energia não falta;
  - ocorrência aberta antes da ligação da UC (`flag_antes_ligacao`, 595).
- **Mês:** o da `data_abertura`. A interrupção que vira o mês fica toda no mês em que abriu.

| Coluna | Definição e decisões |
| :--- | :--- |
| `municipio`, `periodo` | Da `dim_alimentador` e da `dim_mes`. |
| `ucs_atendidas` | Cc do mês (`fato_alimentador_mes`). |
| `interrupcoes` | Interrupções válidas com `duracao_efetiva_min > 0`. A interrupção inteira dentro de outra da mesma UC (147 casos) é o mesmo apagão registrado duas vezes e **não conta no FEC**. |
| `ucs_interrompidas` | UCs distintas interrompidas no mês. |
| `horas_interrupcao` | Σ `duracao_efetiva_min ÷ 60`: o **CHI** (consumidor-hora interrompido). Mostra onde mais gente sofreu; o DEC favorece alimentador pequeno. |
| **`dec`** | `horas_interrupcao ÷ ucs_atendidas`: horas sem energia por UC no mês. |
| **`fec`** | `interrupcoes ÷ ucs_atendidas`: interrupções por UC no mês. |
| `dec_sem_dia_critico`, `fec_sem_dia_critico` | O mesmo sem as ocorrências em dia crítico (média + 3 desvios; os 31 dias de jul/2025). Em P2, o dia crítico responde por 58% do DEC. |
| `ocorrencias_sobrepostas`, `ocorrencias_teto_48h`, `ocorrencias_acima_24h`, `ocorrencias_dia_critico` | Contagens das flags (entram no cálculo e ficam visíveis à parte). O teto de 48h é o maior valor da origem: a duração real pode ter sido maior. |

**Como agregar:**
- DEC e FEC de um **período** = soma dos meses (nunca a média).
- DEC e FEC de um **município** = Σ(`dec × ucs_atendidas`) ÷ Σ `ucs_atendidas` dos seus alimentadores.

## 10. `uc_consumo_comparativo` (UC × mês) · `gold_visao_360`

| Coluna | Definição e decisões |
| :--- | :--- |
| `consumo_kwh` | `consumo_kwh_valido` do mês (nunca negativo). |
| `consumo_kwh_ano_anterior` | Consumo válido do mesmo mês 12 meses antes (self-join pela data, sem `lag`). Fica nulo se não existir. |
| `variacao_pct` | `(consumo − ano anterior) ÷ ano anterior × 100`, em pontos percentuais (38,26 = +38,26%). Nula quando falta o ano anterior ou quando algum dos dois consumos é ≤ 0. |
| `tipo_leitura` | `REAL` ou `ESTIMADA`: uma leitura estimada pode explicar uma "conta alta" sem que o consumo real tenha subido. |
| **`flag_conta_alta`** | `variacao_pct > 20` (o p95 da variação; ≈ 5,4% dos meses). Nula quando a variação é nula. |

## 11. `uc_interrupcoes` (1 linha por ocorrência, 180.000) · `gold_visao_360`

Todas as ocorrências da Silver, inclusive as que ficam fora do DEC/FEC. A API e o agente aplicam os filtros.

| Coluna | Definição |
| :--- | :--- |
| `id_ocorrencia`, `id_uc`, `alimentador`, `tipo`, `causa` | Ocorrência (causa vazia = `NÃO INFORMADA`). |
| `data_abertura`, `data_encerramento` | Data e hora (timestamp). Para filtrar um período, use `< primeiro dia do mês seguinte`; `<= 'AAAA-MM-DD'` perde o último dia. |
| `duracao_min` | Duração original. |
| `duracao_efetiva_min` | Duração sem o trecho já coberto por uma interrupção anterior da mesma UC (0 quando está inteira dentro de outra). |
| `flag_sem_interrupcao`, `flag_antes_ligacao`, `flag_dia_critico`, `flag_duracao_teto`, `flag_sobreposicao` | As mesmas flags do DEC/FEC. |

## 12. `uc_atendimentos` (1 linha por protocolo, 318.871) · `gold_visao_360`

| Coluna | Definição e decisões |
| :--- | :--- |
| `protocolo`, `id_uc`, `canal`, `assunto`, `subassunto` | O chamado. Os canais são `APP`, `PRESENCIAL`, `SITE`, `TELEFONE` e `WHATSAPP`; "call center" são todos eles. |
| `data_abertura`, `data_fechamento` | Data e hora (timestamp). |
| `nota_satisfacao` | 1 a 5; **nula quando o cliente não avaliou** (9.566), nunca zero. |
| `tempo_atendimento_h` | `(data_fechamento − data_abertura)` em horas (o notebook falha se houver negativo). |

## 13 e 14. `tb_fila_perdas` (UCs na fila) e `tb_fila_perdas_auditoria` (todas as 45.000 UCs) · `gold_fila_perdas`

A fila de suspeitas de perda não técnica para a equipe do Rafael. A auditoria tem as mesmas colunas para todas as UCs, inclusive as retidas, com o motivo.

| Coluna | Definição e decisões |
| :--- | :--- |
| `score` | `score_bruto − penalidades`, limitado a 0–100. **Prioridade operacional, não probabilidade de fraude.** |
| `score_bruto` | `p_queda_pct + p_queda_kwh + p_estimada`. |
| `p_queda_pct`, `p_queda_kwh`, `p_estimada` | Pontos pela queda percentual, pela queda absoluta (só com queda ≥ 20% e ≥ 120 kWh/mês) e por leituras estimadas recorrentes. |
| `penalidades` | Atenuantes que reduzem o score: GD conectada na janela, troca de medidor, inspeção recente e outros. |
| `queda_pct`, `queda_kwh_mensal`, `media_anterior`, `media_atual` | Comparação sazonal (mesmos meses do ano anterior) até o mês de corte. |
| `kwh_estimado` | kWh/mês **estimado** pela diferença sazonal (só para elegíveis). É um indicador, **não energia recuperada comprovada**. |
| `kwh_potencial_bruto` | Diferença antes dos critérios de elegibilidade. |
| `acao_recomendada` | `INSPECAO_PRIORITARIA` (prioridade 1, queda qualificada) ou `VALIDACAO_DOCUMENTAL` (prioridade 2: conferir leitura e faturamento antes do campo). Na auditoria, também `NAO_APLICAVEL`. |
| `prioridade_operacional`, `posicao_fila` | 1 = campo; 2 = documental; 9 = não elegível. Posição na fila. |
| `motivos`, `fatores_atenuantes` (e `_json`) | Por que a UC entrou e o que pesa contra. |
| `confianca_evidencia`, `historico_suficiente`, `meses_*`, `pares_*`, `proporcao_pares_estimados` | Qualidade da evidência (quantos meses comparáveis e quantos estimados). |
| `possui_gd`, `primeira_conexao_gd`, `gd_apos_base`, `gd_data_desconhecida`, `houve_troca_na_janela` | Atenuantes: **queda por painel solar ou troca de medidor não é fraude.** |
| `tem_outlier_pareado`, `tem_arredondamento_pareado`, `tem_sem_leitura_anterior_pareada`, `metodo_outlier` | Qualidade das leituras comparadas (outlier = acima do p99,9 da classe, calculado só com dados até o corte). |
| `ultima_inspecao`, `resultado_ultima_inspecao`, `ja_inspecionada`, `inspecao_recente` | Histórico de inspeção (inspeção nos 12 meses anteriores retém a UC para revisão). |
| `status_triagem`, `queda_qualificada` | Elegibilidade e motivo de retenção. |
| `mes_referencia` | Mês de corte (2026-06-01). Só entram eventos conhecidos até o corte. |
| `versao_regra`, `id_execucao`, `executado_em_utc`, `versoes_silver_json`, `metodo_estimativa` | **Linhagem:** a execução lê a Silver numa versão fixa (Delta time travel) e registra a versão de cada fonte. Se a publicação falha, as tabelas voltam à versão anterior (RESTORE). |
