# Diagnóstico da Receita: P1 × P2

> **Pergunta da diretoria (Henrique Duarte, Diretor Comercial):** *"A tarifa residencial acumulou reajuste de 10,5% desde meados de 2022. Mesmo assim, o volume de energia faturada caiu quase 4% e a receita subiu só 8%. Por quê?"*
>
> **Períodos:** P1 = jul/2022 a jun/2023 (primeiro ano da base) · P2 = jul/2025 a jun/2026 (últimos 12 meses).
> **Fonte:** camada Gold (`agg_preco_volume`, `agg_kpis_mensal`, `agg_receita_mensal`, `fato_uc_mes`, `dim_uc`, `tb_fila_perdas`). Volume = `consumo_kwh_valido`, já sem as leituras negativas sem explicação. Todos os números podem ser refeitos no portal (Tela 2) ou no assistente (Tela 7).

## Resposta em uma frase

A receita subiu 8% **pelo preço** (reajuste **e** bandeiras tarifárias), e o volume caiu **porque 3.510 unidades instalaram painel solar** depois de P1. Elas passaram a consumir 61% menos da rede. O resto da base cresceu.

## 1. O que aconteceu: a ponte da receita

A ponte usa a receita de energia (sem tributos), porque os tributos não dependem de preço nem de volume. Ela fecha sem resíduo: receita P1 + efeito-preço + efeito-volume = receita P2.

| | Valor |
| :--- | ---: |
| Receita de energia P1 | R$ 117,83 mi |
| **Efeito-preço** (tarifa média de R$ 0,519 para R$ 0,584 por kWh: +12,4%) | **+R$ 14,43 mi** |
| **Efeito-volume** (227,05 para 218,08 GWh: −3,95%) | **−R$ 4,99 mi** |
| Receita de energia P2 | R$ 127,26 mi (+8,0%) |
| Receita faturada com tributos | R$ 157,11 mi para R$ 169,68 mi (+8,0%) |

## 2. Por que o preço subiu mais que o reajuste: as bandeiras

O efeito-preço (+12,4%) passa do reajuste citado (10,5%) porque **P1 teve 12 meses de bandeira verde e P2 teve só 4**. Em P2 foram 5 meses de vermelha e 3 de amarela.

| Tarifa média (R$/kWh, sem tributos) | Valor | Variação |
| :--- | ---: | ---: |
| P1, todos os meses em bandeira verde | 0,5190 | |
| P2, só os meses em bandeira verde | 0,5642 | **+8,7%**: reajuste (e mix de classes) |
| P2, meses fora da bandeira verde | 0,5958 | **+5,6%** sobre a verde de P2: bandeira |
| P2, média do período | 0,5836 | +12,4% sobre P1 |

- **Reajuste:** cerca de **R$ 9,9 mi** do efeito-preço. Na classe residencial, a tarifa em bandeira verde subiu 9,3%, próximo do reajuste citado.
- **Bandeiras:** cerca de **R$ 4,2 mi**. **Se P2 tivesse sido todo em bandeira verde, a receita de energia teria subido só cerca de 4,4%, e não 8%.**

> Estimativa: a separação usa a tarifa média dos meses verdes de P2 como referência do reajuste e aplica as diferenças ao volume de P2. O resíduo de cerca de R$ 0,3 mi é mix de classes e bairros.

## 3. Por que o volume caiu: geração distribuída

Dividindo as 45 mil UCs pelo que aconteceu com cada uma entre P1 e P2:

| Grupo de UCs | UCs | Volume P1 | Volume P2 | Variação |
| :--- | ---: | ---: | ---: | ---: |
| **Passaram a ter GD (painel solar) depois de P1** | 3.510 | 18,30 GWh | 7,10 GWh | **−11,20 GWh (−61%)** |
| Trocaram de medidor | 5.827 | 27,30 GWh | 27,97 GWh | +0,67 GWh (+2,2%) |
| Demais UCs | 35.663 | 181,45 GWh | 183,01 GWh | +1,56 GWh (+0,5%) |
| **Total** | **45.000** | **227,05 GWh** | **218,08 GWh** | **−8,97 GWh (−3,95%)** |

- **A GD explica mais do que toda a queda.** Sem as UCs que passaram a gerar a própria energia, o volume teria **subido cerca de 1%**. Toda a GD da base foi conectada depois de P1: 1.845 UCs em 2024, 1.304 em 2025 e 361 no 1º semestre de 2026.
- **A queda está na classe residencial e na comercial.** Na residencial, as UCs com GD perderam 6,51 GWh e as sem GD **cresceram 3,0%**. Na comercial, as UCs com GD perderam 4,71 GWh e as sem GD caíram 1,3%. É a única queda que sobra fora da GD e merece acompanhamento; Jaboatão dos Guararapes concentra a maior queda de volume municipal (−6,8%).
- **Onde dói em reais:** a GD tirou cerca de **R$ 6 mi** de receita de energia, medidos na tarifa de P1. Isso é mais que todo o efeito-volume (−R$ 4,99 mi), porque o restante da base somou receita.

### Hipóteses descartadas pelos dados

| Hipótese | O que os dados mostram |
| :--- | :--- |
| A base de clientes cresceu, então o volume deveria subir | A base praticamente não mudou: entraram 259 UCs (+0,6%) e nenhuma saiu. Nas mesmas UCs, o volume caiu 4,3%. |
| Furto e fraude (perdas não técnicas) | A fila de perdas tem 181 UCs, com cerca de 26 MWh/mês estimados (≈ 0,3 GWh/ano), o equivalente a **3% da perda causada pela GD**. As inspeções históricas confirmaram irregularidade em 62,7% dos casos (871 de 1.389). |
| Troca de medidor reduzindo a leitura | As UCs que trocaram de medidor **aumentaram** o consumo (+2,2%). As 6,3 mil trocas para medidor SMART (set/2025 a mar/2026) foram tratadas na Silver; a primeira leitura depois da troca não vira consumo negativo. |
| Leituras estimadas distorcendo o volume | A proporção de leituras estimadas **caiu** de 19,0% (P1) para 15,8% (P2). |

## 4. Recomendações para a diretoria comercial

| # | Recomendação | Ordem de grandeza do impacto |
| :-: | :--- | :--- |
| 1 | **Projetar a receita sem bandeiras.** Fazer o orçamento com tarifa em bandeira verde e tratar a bandeira como receita variável, que repassa custo de geração e não é crescimento. | Cerca de **R$ 4 mi/ano** (≈ 3% da receita de energia de P2) podem sumir num ano de bandeira verde. A alta "estrutural" é de cerca de 4%, não 8%. |
| 2 | **Incluir a GD no planejamento de mercado.** Prever o volume pelo ritmo de conexões e de pedidos de homologação (cerca de 3,5 mil chamados/ano de homologação de GD no call center, um indicador antecipado). Cada nova UC com GD deixa de comprar cerca de 3,2 MWh/ano. | Cerca de **R$ 1,9 mil/ano por nova UC com GD**. No ritmo de 2025 (cerca de 1,3 mil conexões/ano), são cerca de **4 GWh e R$ 2,4 mi/ano a menos a cada ano** (≈ −1,9% de volume/ano). |
| 3 | **Rever como a GD paga pelo uso da rede.** Verificar se a compensação das UCs com GD segue a transição da Lei 14.300/2022, que cobra gradualmente o uso da rede (fio B) de quem gera a própria energia, e avaliar produtos para esse cliente (manutenção, armazenamento, serviços). | Protege parte dos cerca de **R$ 6 mi/ano** que a GD já tira da receita. |
| 4 | **Não esperar que o combate a perdas recupere o volume.** Manter a fila focada nos 8 casos de inspeção prioritária e nos 173 de validação documental, com a GD como atenuante (queda por painel solar não é fraude). | Cerca de **0,3 GWh/ano**: útil para a operação, mas pequeno diante dos 9 GWh de queda. |
| 5 | **Investigar a classe comercial sem GD**, a única com queda fora da GD (−1,3%), começando por Jaboatão dos Guararapes. | Cerca de **R$ 0,3 mi/ano** se a tendência se mantiver (0,55 GWh na tarifa comercial). |

## 5. Como conferir

- **Tela 2 (Diagnóstico da Receita):** a ponte e o drill-down por município, bairro e classe.
- **Tela 7 (Assistente):** *"A receita subiu só 8% com reajuste de 10,5% e volume caindo 4%. Por quê?"* traz a ponte, o efeito-preço em % e os meses fora da bandeira verde.
- **Regras e definições:** README, seções 2.3 (tratamento de dados) e 2.6 (dicionário da Gold).
