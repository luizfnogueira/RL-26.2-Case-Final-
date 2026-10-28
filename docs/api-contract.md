# Contrato da API — V-Energy — V2 (proposta para revisão; alinhada à Gold em 23/10)

Os arquivos JSON vinculados abaixo fazem parte deste contrato e são os exemplos completos usados no Swagger. Todos são **fictícios**. As ordens de inspeção (`GET/POST/PATCH /inspecoes`) persistem no PostgreSQL. Dashboard, filtros, fila de candidatos, unidades (Visão 360) e números do insight de receita usam a fonte selecionada por `GOLD_SOURCE`: `seed` para desenvolvimento ou `real` para a Gold importada (no `seed`, unidades devolvem o exemplo fictício do contrato). Operação ainda usa respostas simuladas. A geração de texto da IA é configurada separadamente por `IA_MODO`.

**A Gold é a fonte de verdade.** Quando este contrato e a Gold divergem, quem se adapta é a API: o contrato e o código mudam, os dados não. As adaptações estão na seção 16; tabelas, colunas e regras da Gold estão no *Contrato de dados Gold → API* (v2).

## 1. Regras comuns

- JSON em `snake_case`. IDs de UC são strings; `id_ordem` e o `{id}` de PATCH são inteiros positivos, alinhados ao modelo do Gabriel.
- Datas: `YYYY-MM-DD`; instantes: ISO 8601 com fuso. Valores são números JSON; dinheiro em BRL, energia em kWh, DEC em h/UC, FEC em interrupcoes/UC.
- Indicadores: `{valor, unidade, periodo_referencia}`. `null` significa ausente; não converter ausência em zero.
- `metadados.dados_ficticios=true` identifica o mock. `gold_atualizada_em` é timestamp da última carga **de dados**, distinto de `gerado_em` da IA. Neste stub ambos são fictícios; o front formata “hoje, 06:15” a partir do timestamp, sem texto fixo.
- `page=1`, `page_size=20` por padrão; limites 1 e 100. Resposta paginada: `{items, page, page_size, total}`. `total` após filtros, antes da paginação; página além do fim retorna `items: []`.
- Filtros geográficos combinam por AND; `bairro` exige `municipio`. Campos extras de escrita: 422.

### Períodos e filtros

`periodo_atual` e `periodo_comparacao`: string `YYYY-MM/YYYY-MM`, com início/fim **inclusivos**. Um mês também pode ser expresso como `YYYY-MM`. Validar meses, início ≤ fim e comparações de mesma duração, diferentes entre si.

Exemplo da tela: `periodo_atual=2025-07/2026-06` e `periodo_comparacao=2022-07/2023-06`. O formato de transporte é uma decisão desta proposta, não um nome de coluna da Gold.

| Rota | Query ou corpo |
| --- | --- |
| GET /dashboard | Ambos os períodos obrigatórios; município, bairro, classe, alimentador; `nivel=municipio|bairro|classe`, page, page_size |
| GET /unidades | busca (ID ou titular, 3–100 caracteres); município, bairro, classe, alimentador; page, page_size |
| GET /unidades/{id} | periodo_atual opcional, sempre de 12 meses; sem ele, os 12 meses até o último mês da Gold |
| GET /inspecoes/candidatos | periodo_atual obrigatório; comparação opcional; município, bairro, classe, alimentador; page, page_size |
| GET /inspecoes | id_uc, status, periodo_atual (data de criação); município, bairro, classe, alimentador; page, page_size |
| GET /operacao | periodo_atual obrigatório; município, bairro, alimentador; ordenar_por=dec|fec|chi; nivel_regional=municipio|bairro; page, page_size |
| POST /ia | pergunta |
| GET /filtros | sem parâmetros |
| POST /ia/insight | contexto=receita|unidade; filtros; indicadores; id_uc para resumo da unidade |

Os parâmetros sem indicação de obrigatoriedade são opcionais. Classe não está disponível no mock operacional e retorna erro explícito se enviada. Filtros de bairro em operação selecionam os alimentadores que atendem o bairro; não recalculam seu denominador.

### Limites dos stubs

Os cenários analíticos estão preparados para as duas janelas anuais acima. Outros intervalos sintaticamente válidos — inclusive um mês isolado (`YYYY-MM`) — retornam **422 `CENARIO_STUB_INDISPONIVEL`**, em vez de devolver números de outro período. Isso é limite do stub, não do formato: `YYYY-MM` continua válido no contrato (por exemplo, no filtro `periodo_atual` de GET /inspecoes, que não depende de cenário) e a integração real deverá atender os intervalos, mensais ou não, disponíveis na Gold.

Filtros e paginação operam sobre exemplos locais, exceto as ordens de inspeção, que são lidas do schema `portal`. Dashboard possui recortes fictícios por município → bairro → classe; os valores regionais são distribuição ilustrativa do consolidado. Não representam metodologia ou diagnóstico real. POST/PATCH das demais rotas usam snapshot: alterações não persistem entre chamadas. A persistência das ordens não é um stub: o índice único parcial do banco garante uma única ordem ativa por UC mesmo em requisições concorrentes.

## 2. Erros

```json
{"codigo": "TRANSICAO_INVALIDA", "mensagem": "A ordem não permite a transição solicitada."}
```

| HTTP | Código | Situação |
| --- | --- | --- |
| 400 | TRANSICAO_INVALIDA | Estado atual não permite a transição |
| 400 | JUSTIFICATIVA_OBRIGATORIA | Cancelamento sem justificativa |
| 400 | RESULTADO_INCOMPLETO | Conclusão sem resultado |
| 404 | UC_INEXISTENTE | UC não disponível no cadastro/cenário |
| 404 | ORDEM_NAO_ENCONTRADA | ID de ordem inexistente |
| 409 | ORDEM_ATIVA_EXISTENTE | UC já tem ordem ABERTA ou EM_CAMPO |
| 422 | DADOS_INVALIDOS | Tipos, formato ou campos incompatíveis, inclusive resultado inconsistente |
| 422 | CENARIO_STUB_INDISPONIVEL | Consulta válida, mas fora dos cenários simulados |
| 422 | DECOMPOSICAO_INDISPONIVEL | Insight da receita fora de P1 × P2, com filtro de alimentador ou em recorte sem decomposição na Gold |
| 500 | ERRO_INTERNO | Falha inesperada, sem detalhes internos na resposta |
| 503 | AGENTE_INDISPONIVEL | Agente de IA fora do ar, sem resposta dentro do `IA_TIMEOUT_S` ou com resposta fora do contrato |

`AppException` e HTTPException passam pelo handler comum. Os códigos de domínio seguem `app/core/exceptions.py`. `nao_sei` e `bloqueado` são estados válidos de resposta da IA (HTTP 200), não erros de transporte.

## 3. GET /dashboard — Telas 1 e 2

```http
GET /dashboard?periodo_atual=2025-07/2026-06&periodo_comparacao=2022-07/2023-06
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/dashboard.json)**

- `indicadores`: exatamente seis KPIs — receita_faturada, energia_faturada, ucs_ativas, inadimplencia, dec_medio, fec_medio. Cada um tem atual, comparação, diferença e variação percentual; campos não aplicáveis retornam null.
- Definições da Gold (`agg_kpis_mensal`; com filtro, as mesmas regras sobre `fato_uc_mes`):
  - `receita_faturada` = Σ `valor_total` (com tributos).
  - `energia_faturada` = Σ `consumo_kwh_valido` do `fato_uc_mes` (consumo sem as leituras negativas não recuperadas).
  - `ucs_ativas` = UCs **ligadas até o fim do último mês** de cada janela (`data_ligacao`; sem data, conta sempre), a mesma regra do Cc da `gold.fato_alimentador_mes`: o retrato da base de clientes, como as distribuidoras reportam.
  - `inadimplencia` = Σ `valor_total` das faturas `EM ABERTO` no período (`valor_em_aberto` da Gold); inclui o percentual da receita em cada período e a variação em pontos percentuais. Rótulo na tela: **“Valor em aberto”**. No mercado, inadimplência é o valor **vencido** e não pago; nesta base o histórico termina em jun/2026 e toda fatura em aberto já venceu, então os dois números coincidem.
  - `dec_medio` / `fec_medio` = soma dos DEC/FEC mensais da janela; cada mês divide pelas UCs atendidas naquele mês (Cc mensal). Seguem as regras da `gold.agg_dec_fec_mensal`: interrupções de 3 minutos ou mais (PRODIST Módulo 8), sem oscilação e sem ocorrências anteriores à ligação da UC, com a duração efetiva (sem contar em dobro o tempo sobreposto). Com filtro de bairro, classe ou alimentador, retornam null: a continuidade só é agregada por alimentador e município.
- `serie_historica`: 48 pontos mensais, jul/2022–jun/2026, cada um com receita e energia. A janela da série é independente das duas janelas de comparação.
- `ponte_receita`: decompõe a **receita de energia** (sem tributos), como `gold.agg_preco_volume`: receita_energia_comparacao + efeito_preco + efeito_volume = receita_energia_atual, sem resíduo. Exemplo do stub: 205,9 + 24,7 − 8,2 = 222,4 milhões. efeito_volume = (kWh atual − kWh comparação) × tarifa de comparação, por recorte e depois somado; efeito_preco = variação da receita de energia − efeito_volume. reajuste_percentual = variação da tarifa média de energia. Não há parcela de bandeira/mix.
- `drill_down`: nível, breadcrumb e lista paginada; receita de energia, volume, variação, queda em kWh, efeitos em BRL e filtros para cada linha. Ordenado por maior queda absoluta em kWh, depois nome.
- Nível bairro exige município; nível classe exige município e bairro. Ao selecionar uma linha, reenviar seus filtros com o próximo nível. Remover filtros descendentes ao voltar pelo breadcrumb.

```http
GET /dashboard?periodo_atual=2025-07/2026-06&periodo_comparacao=2022-07/2023-06&nivel=bairro&municipio=Recife
GET /dashboard?periodo_atual=2025-07/2026-06&periodo_comparacao=2022-07/2023-06&nivel=classe&municipio=Recife&bairro=Boa%20Vista
```

A API lê os efeitos pré-calculados em `gold.agg_preco_volume` e só os soma; não refaz a decomposição. A tabela existe para P1 × P2 (`periodo_atual=2025-07/2026-06`, `periodo_comparacao=2022-07/2023-06`) e por município, bairro e classe. Fora disso — outras janelas ou filtro de alimentador — `ponte_receita` vem com todos os valores null e `drill_down` com a lista vazia, e `metadados.observacoes` diz o motivo; os KPIs e a série seguem calculados normalmente.

## 4. GET /unidades — busca da Tela 3

```http
GET /unidades?busca=UC-DEMO&page=1&page_size=20
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/unidades.json)**

Items: id_uc, nome_titular, município, bairro, classe, alimentador e status. Busca por ID/titular, de 3 a 100 caracteres (fora disso, 422 `DADOS_INVALIDOS`), sem diferenciar maiúsculas; ordenação por ID. Sem correspondência: lista vazia. Fonte: `gold.dim_uc`.

## 5. GET /unidades/{id} — Tela 3

```http
GET /unidades/UC-DEMO-001?periodo_atual=2025-07/2026-06
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/unidade.json)**

- **Janela:** `periodo_atual` tem sempre 12 meses (outra duração: 422 `DADOS_INVALIDOS`). Sem ele, a API usa os 12 meses que terminam no último `mes_referencia` da `gold.dim_mes`; o valor não é fixo no código, e a tela acompanha cada recarga da Gold. A janela usada volta em `periodo_referencia`. Janela sem dados da UC devolve 200 com valores null; o 404 fica para UC inexistente.
- Fontes na Gold: cadastro, medidor ativo e GD da `dim_uc`; faturas, última leitura e troca de medidor do `fato_uc_mes`; consumo, ano anterior, variação, `tipo_leitura` e conta alta da `uc_consumo_comparativo` (consumo = `consumo_kwh_valido`); interrupções da `uc_interrupcoes`; chamados da `uc_atendimentos`.
- **Nulos medidos na Gold (27/10):** só são anuláveis `telefone` (não há fonte), `cep` (1.350 UCs), `data_ligacao` (90), `data_pagamento` (toda fatura `EM ABERTO`) e `nota_satisfacao` (9.566 chamados). Os demais campos do cadastro, medidor, faturas, interrupções e chamados não têm nulo e são obrigatórios. CPF/CNPJ vem mascarado. Nomes de município, bairro e classe vêm em maiúsculas, como na Gold.
- `consumo`: **sempre os 12 meses da janela**, em ordem, cada um com o mesmo mês do ano anterior, ambos com unidade e referência, mais `tipo_leitura` (`REAL`, `ESTIMADA`, `MEDIA`, `AUTENTICADA` ou `NAO REALIZADA`). Como na série do `GET /dashboard`, mês sem dado da UC (UC ligada depois do início da janela, ou janela além da base) entra com `atual`, `ano_anterior` e `tipo_leitura` null, nunca some: o gráfico tem eixo fixo. Valores ausentes são null, nunca 0: o ano anterior não existe nos 12 primeiros meses da UC, e o consumo é null nos 30 meses com leitura negativa não recuperada (`consumo_kwh_valido`), que o diagnóstico trata como “sem consumo válido”.
- `diagnostico_conta` analisa **um mês**: o último da janela com dado da UC, devolvido em `periodo_referencia` (null, com `veredito` null, se a janela não tem dados). Assim uma janela que passa do fim da base, como 2026-01/2026-12, ainda é avaliada sobre jun/2026.
  - **Ano anterior** (`conta_alta`, `mesmo_mes_ano_anterior`, `variacao_percentual`): lidos de `gold.uc_consumo_comparativo`, sem recalcular. `flag_conta_alta` = consumo **mais de 20% acima** do mesmo mês do ano anterior; null quando não há ano anterior ou algum dos consumos é ≤ 0.
  - **Média** (`media_12_meses`, `meses_media`): calculada pela API sobre os **12 meses anteriores ao mês analisado, sem incluí-lo** e independente da janela (ex.: jun/2026 → 2025-06/2026-05), só com consumo > 0. Com menos de 12 meses válidos, usa os que existem; `meses_media` diz quantos entraram (0 a 12) e a média é null com 0.
  - **Veredito** (texto, regra da API): cruza as duas comparações com o mesmo limiar de 20%. Ano anterior e média acima → o consumo subiu e explica a conta; só o ano anterior → o consumo vem subindo ao longo do ano; só a média → efeito sazonal; nenhum → consumo estável, e uma conta maior vem de tarifa, bandeira ou tributos. Sem ano anterior, usa só a média. Mês sem consumo válido não é avaliado.
  - **Alerta** (`leitura_estimada`, `alerta`): o alerta não muda o veredito, só diz quanto confiar nele. `leitura_estimada` é true quando o mês analisado **ou** o mesmo mês do ano anterior tem leitura `ESTIMADA`. `alerta` junta uma frase para cada caso: leitura estimada no mês analisado, leitura estimada no ano anterior (comparação fraca) e **primeira leitura após troca de medidor** (`fato_uc_mes.flag_primeira_leitura_pos_troca`) em qualquer dos dois meses. Sem nenhum caso, null.
- `faturas_abertas`: **todas** as faturas `EM ABERTO` da UC, de qualquer mês. São o estado atual do cliente, não um recorte de período. `faturas_pagas`: as `PAGA` com `mes_referencia` dentro da janela. `status` e `bandeira_tarifaria` seguem os domínios da Gold (`PAGA`/`EM ABERTO`; `VERDE`, `AMARELA`, `VERMELHA P1`, `VERMELHA P2`).
- `interrupcoes_recentes`: até 10, as mais recentes da janela. `total_interrupcoes`: todas as da janela, em `interrupcoes`. Ambas seguem as regras do DEC/FEC (`gold_dec_fec`), para a Visão 360 bater com a Operação: sem oscilação (`flag_sem_interrupcao`: a energia não falta), sem ocorrências anteriores à ligação (`flag_antes_ligacao`), só com 3 minutos ou mais (PRODIST) e só com duração efetiva > 0 (a interrupção inteira dentro de outra da mesma UC é o mesmo apagão). `duracao_min` é a `duracao_efetiva_min` da Gold, a mesma que o DEC soma: desconta o trecho sobreposto, então pode ser menor que encerramento − abertura. O mês da ocorrência é o da hora registrada. As flags da Gold não aparecem cruas na resposta.
- `chamados`: todos os da UC (no máximo 20 por UC na base), com nota (null quando não preenchida, nunca 0) e `tempo_atendimento_h`.
- **Horários de negócio** (abertura e encerramento das interrupções, abertura e fechamento dos chamados) saem com `-03:00`. A origem exporta hora local e o pipeline não converte fuso, então o CSV da Gold marca essa hora como UTC (`Z`); a API mantém o relógio e só corrige o rótulo (19:20Z → 19:20-03:00), sem converter. `metadados.gold_atualizada_em` é UTC de verdade (horário da exportação) e segue sem mudança. Durações não são afetadas. Pendência dos dados: interpretar esses horários em `America/Recife` na Silver.
- Medidor ativo (id, modelo, tipo, data de instalação e última leitura). `geracao_distribuida` é null **inteiro** para UC sem GD (os quatro `gd_*` da `dim_uc` são nulos exatamente nas 41.490 UCs sem painel); quando existe, potência, modalidade, data de conexão e média injetada vêm todos preenchidos. Média mensal injetada de GD não é geração medida no período.
- O exemplo é um caso fictício que segue as regras acima: o diagnóstico do `unidade.json` é o que a API calcula sobre o consumo do próprio exemplo (`test_diagnostico_conta.py`).

No mock (`GOLD_SOURCE=seed`), somente UC-DEMO-001 tem a visão detalhada e só a janela 2025-07/2026-06 é simulada; a leitura real usa `GOLD_SOURCE=real`. IDs não disponíveis retornam 404. Nunca atribuir o cadastro de uma UC a outro ID.

## 6. GET /inspecoes/candidatos — Tela 4

```http
GET /inspecoes/candidatos?periodo_atual=2025-07/2026-06&page=1&page_size=20
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/candidatos.json)**

`resumo`, antes da paginação e com os mesmos filtros: UCs analisadas (UCs do cadastro, o universo da `tb_fila_perdas_auditoria`), UCs priorizadas (UCs na `tb_fila_perdas`, todas elegíveis), potencial de recuperação (Σ `kwh_estimado` das priorizadas) e ordens ativas (do schema `portal`). Cada candidato: ID, localização, classe, alimentador, posição, motivos[], energia estimada, score (0–100), `confianca_evidencia` (`ALTA`, `MEDIA`, `BAIXA` ou `INDETERMINADA`), ordem_ativa e id_ordem_ativa.

Ordenar como `gold.tb_fila_perdas`: score decrescente, `energia_estimada` (`kwh_estimado`) decrescente e ID crescente; posição global após filtros (na Gold, `posicao_fila`). Só UCs com `status_triagem = ELEGIVEL` entram. `score` não é probabilidade de fraude e `energia_estimada` é uma estimativa, não energia comprovada; a tela deve deixar isso claro. Desabilitar seleção de UC com ordem ativa no front; POST também valida duplicidade. Estimativa futura não é o kWh já recuperado do histórico.

## 7. Ordens — Telas 4 e 5

### Regra da fila com Gold real

Com `GOLD_SOURCE=real`, `GET /inspecoes/candidatos` exige tanto
`status_triagem=ELEGIVEL` quanto `acao_recomendada=INSPECAO_PRIORITARIA`.
O total de candidatos, as UCs priorizadas e o potencial de recuperação do resumo
consideram esse recorte, antes da paginação.

Casos de `VALIDACAO_DOCUMENTAL` permanecem na Gold, mas não aparecem na fila de
inspeção nem podem gerar ordem de campo pelo `POST /inspecoes`. O backend aplica
esse bloqueio mesmo quando a chamada é feita diretamente, sem passar pela tela.
Não há endpoint ou tela de tratamento documental definido nesta entrega.

Esse comportamento foi alinhado com o responsável pela interface da fila em
27/10/2026, sem incompatibilidade com o fluxo visual existente. O modo `seed`
mantém o comportamento de desenvolvimento.

### Ciclo das ordens

Reutiliza os modelos e regras do Gabriel (`schemas/inspecao.py`), com adaptadores de transporte em `schemas/inspecoes.py`. As regras de ciclo não mudam; a persistência usa as tabelas `portal.ordens_inspecao` e `portal.ordens_historico`.

- Fluxo: ABERTA → EM_CAMPO → CONCLUIDA; cancelar em ABERTA ou EM_CAMPO. Status finais não reabrem.
- `data_prevista` é campo, não status. Uma ordem ativa por UC.
- Resposta usa id_ordem inteiro, id_uc, equipe_responsavel, datas, motivo, kwh_estimado, observacoes, resultado e historico[].
- Resultado público: **irregularidade_detectada** (bool), tipo_irregularidade, kwh_recuperado, observacoes obrigatórias, data_inspecao/inspetor opcionais. O alias interno `irregularidade` do modelo do Gabriel não é o nome de saída da API V2.
- Com irregularidade: tipo obrigatório e kWh não negativo. Sem irregularidade: tipo null e kWh zero. Não há `classificacao` ou `INCONCLUSIVA` neste contrato, para corresponder ao modelo existente.
- `historico[]`: id_historico, id_ordem, status_anterior, status_novo, data_mudanca, usuario, justificativa_ou_motivo e detalhes.

### GET /inspecoes

```http
GET /inspecoes?page=1&page_size=20
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/inspecoes.json)**

`contagem_status` conta os resultados após filtros de UC/região/período, antes do filtro status e da paginação; sustenta as abas da Tela 5. Ordenação: criação decrescente e ID crescente.

### POST /inspecoes

Obrigatórios: id_uc e equipe_responsavel. data_prevista opcional no modelo do Gabriel; a modal pode exigir antes do envio. Demais campos opcionais. Servidor gera ID, datas, status e histórico.

Com `GOLD_SOURCE=real`, uma UC marcada como `VALIDACAO_DOCUMENTAL` em
`gold.tb_fila_perdas` retorna **422 `DADOS_INVALIDOS`**, sem criar ordem nem
histórico. A interface deve exibir a mensagem retornada pela API:

```json
{
  "codigo": "DADOS_INVALIDOS",
  "mensagem": "UC requer validacao documental antes de gerar inspecao."
}
```

```http
POST /inspecoes
Content-Type: application/json
```

```json
{
  "id_uc": "UC-DEMO-001",
  "equipe_responsavel": "Equipe Norte 02",
  "data_prevista": "2026-10-22",
  "motivo": "Verificar variação de consumo.",
  "kwh_estimado": 120.0,
  "observacoes": null
}
```


**201 — [JSON completo da resposta](../backend/app/services/fixtures/ordem_criada.json)**

### PATCH /inspecoes/{id}

```http
PATCH /inspecoes/1
Content-Type: application/json
```

```json
{
  "status": "EM_CAMPO"
}
```


**200 — [JSON completo da resposta](../backend/app/services/fixtures/ordem_atualizada.json)**

Conclusão (no snapshot, usar ordem **2**, já EM_CAMPO):

```json
{
  "status": "CONCLUIDA",
  "resultado": {
    "irregularidade_detectada": true,
    "tipo_irregularidade": "BY-PASS",
    "kwh_recuperado": 120.0,
    "observacoes": "Resultado fictício",
    "data_inspecao": "2026-10-21T06:15:00-03:00",
    "inspetor": null
  }
}
```


Cancelamento (ordem 1 ou 2):

```json
{
  "status": "CANCELADA",
  "justificativa": "Ordem criada em duplicidade."
}
```


Resposta completa da ordem com histórico acrescentado. Campos não enviados permanecem; não permite trocar UC, ID ou data de criação. A equipe pode mudar ao iniciar campo. Combinações de campos inválidas: 422; transição inválida: 400.

Persistência: `GET`, `POST` e `PATCH /inspecoes` leem e gravam no schema `portal`. A ordem e o evento de histórico são gravados no mesmo commit. O índice único parcial `uq_ordens_inspecao_uc_ativa` impede duas ordens ABERTA/EM_CAMPO para a mesma UC; a segunda criação concorrente recebe 409 `ORDEM_ATIVA_EXISTENTE`. Ordens concluídas ou canceladas não bloqueiam uma nova ordem.

## 8. GET /operacao — Tela 6

```http
GET /operacao?periodo_atual=2025-07/2026-06&ordenar_por=dec&page=1&page_size=20
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/operacao.json)**

- DEC e FEC seguem a `gold.agg_dec_fec_mensal`: interrupções de 3 minutos ou mais, sem oscilação e sem ocorrências anteriores à ligação da UC, com a duração efetiva; o denominador são as UCs atendidas pelo alimentador no mês. No período, DEC/FEC são a soma dos meses.
- `dec_sem_dia_critico` / `fec_sem_dia_critico`: os mesmos indicadores sem os dias críticos (`flag_dia_critico`, como o expurgo do PRODIST; na base, julho de 2025).
- `horas_interrupcao`: o CHI (consumidor-hora interrompido), total de horas sem energia somadas nas UCs. Mostra onde mais gente sofreu, já que o DEC favorece alimentadores pequenos.
- `serie_historica`: DEC e FEC mensais por alimentador, com e sem dia crítico.
- `ranking_alimentadores`: lista paginada com DEC e FEC (com e sem dia crítico), número de interrupções, horas de interrupção, UCs atendidas, município e bairros atendidos.
- `ranking_regional`: lista paginada com DEC e FEC (com e sem dia crítico), interrupções e horas de interrupção; `nivel_regional=municipio` (padrão, bairro null) ou `bairro` (município e bairro preenchidos).
- Rankings ordenados pelo indicador escolhido (`ordenar_por=dec|fec|chi`), decrescente. Mesmo page/page_size aplicado independentemente a cada ranking; totais próprios. A série não é truncada pela paginação.
- Clicar em um alimentador reconsulta com `alimentador`, filtrando série e rankings. O mock tem 12 pontos por alimentador; os totais de DEC/FEC correspondem à soma mensal fictícia.

## 9. POST /ia — Tela 7 e painel flutuante

```http
POST /ia
Content-Type: application/json
```

```json
{
  "pergunta": "Qual foi a receita no período?"
}
```


**200 — [JSON completo da resposta](../backend/app/services/fixtures/resposta_ia.json)**

Resposta: resposta, sql (string/null), tabelas[], dados{colunas[], linhas[][]}, status (`ok`, `nao_sei`, `bloqueado`), gerado_em e metadados. Linhas seguem a ordem de colunas. O bloco “Como cheguei nisso” usa esses três campos de auditoria, não raciocínio interno do agente.

Cenários demonstrativos:

| Pergunta | Status / resposta completa |
| --- | --- |
| Qual foi a receita no período? | ok — exemplo acima |
| Qual a previsão de lucro em 2030? | [nao_sei](../backend/app/services/fixtures/resposta_ia_nao_sei.json) |
| DROP TABLE clientes | [bloqueado](../backend/app/services/fixtures/resposta_ia_bloqueado.json) |

A API é a ponte com o agente de IA da Equipe 3, escolhido pela variável `IA_MODO` do `.env`:

- `mock` (padrão): os três cenários acima, sem chamar o agente; outras perguntas retornam nao_sei. A demonstração de bloqueio não substitui as proteções do agente real.
- `real`: a pergunta vai para o agente, que gera e executa a consulta somente leitura na Gold.

Em qualquer modo, a API confere a resposta contra este formato antes de devolvê-la. Agente fora do ar, sem resposta dentro do `IA_TIMEOUT_S` ou com resposta fora do formato: 503 `AGENTE_INDISPONIVEL`, com mensagem amigável. Chaves e endereço do agente ficam só no `.env` do backend, nunca na resposta. Nome `gold_receita_demo` e SQL do exemplo são ilustrativos; validar os nomes reais com a Equipe 3.

## 10. POST /ia/insight — Telas 2 e 3

```http
POST /ia/insight
Content-Type: application/json
```

```json
{
  "contexto": "receita",
  "filtros": {
    "periodo_atual": "2025-07/2026-06",
    "periodo_comparacao": "2022-07/2023-06",
    "municipio": null,
    "bairro": null,
    "classe": null,
    "alimentador": null
  },
  "id_uc": null,
  "indicadores": [
    {
      "valor": 222421875.0,
      "unidade": "BRL",
      "periodo_referencia": "2025-07/2026-06",
      "nome": "receita_energia_atual",
      "rotulo": "Receita de energia atual"
    },
    {
      "valor": 205937500.0,
      "unidade": "BRL",
      "periodo_referencia": "2022-07/2023-06",
      "nome": "receita_energia_comparacao",
      "rotulo": "Receita de energia base"
    },
    {
      "valor": -3.8986,
      "unidade": "%",
      "periodo_referencia": "2025-07/2026-06",
      "nome": "variacao_volume",
      "rotulo": "Volume"
    },
    {
      "valor": 12.3861,
      "unidade": "%",
      "periodo_referencia": "2025-07/2026-06",
      "nome": "reajuste",
      "rotulo": "Reajuste"
    },
    {
      "valor": 24655666.05,
      "unidade": "BRL",
      "periodo_referencia": "2025-07/2026-06",
      "nome": "efeito_preco",
      "rotulo": "Efeito-preço"
    },
    {
      "valor": -8171291.05,
      "unidade": "BRL",
      "periodo_referencia": "2025-07/2026-06",
      "nome": "efeito_volume",
      "rotulo": "Efeito-volume"
    }
  ]
}
```


**200 — [JSON completo da resposta](../backend/app/services/fixtures/resposta_insight.json)**

Resposta separada do chat: `titulo`, `texto`, `numeros_utilizados[]` (nome, rótulo, valor, unidade, período), gerado_em e metadados com atualização da Gold.

Receita usa **seis números**: receita de energia atual, receita de energia base, variação do volume, reajuste, efeito-preço e efeito-volume (os mesmos da `ponte_receita` e dos KPIs do `GET /dashboard`, lidos da Gold). Os números enviados são opcionais; se presentes, precisam corresponder aos da Gold para o recorte (senão 422 `DADOS_INVALIDOS`). A API nunca confia em valores do navegador nem do módulo de IA: os números da resposta são sempre os da Gold.

**Insight da receita (B5).** Só existe para `periodo_atual=2025-07/2026-06` × `periodo_comparacao=2022-07/2023-06`, sem `alimentador` e em recorte com decomposição na Gold; fora disso, 422 `DECOMPOSICAO_INDISPONIVEL`. Nomes de município e bairro vão como estão no banco (a Gold usa maiúsculas, ex.: `RECIFE`, `BOA VISTA`). O texto vem do módulo da Equipe 3 (`IA_MODO=real`, `IA_INSIGHT_URL`, `IA_TIMEOUT_S`) ou de um texto por regra (`IA_MODO=mock`). **Diferente do chat, falha do módulo não vira 503:** fora do ar, lento além do `IA_TIMEOUT_S`, erro HTTP ou resposta fora de `{titulo, texto}` devolvem 200 com um texto alternativo montado por regra sobre os mesmos números, e `metadados.observacoes` ganha uma linha começando por `Texto alternativo:`. O front usa esse prefixo para não rotular o texto como gerado por IA.

Formato assumido para o módulo da Equipe 3 (a confirmar até 29/10): `POST IA_INSIGHT_URL` com `{contexto, filtros, numeros_utilizados[]}` e `Authorization: Bearer IA_API_KEY`, resposta `{titulo, texto}`.

Para UC360:

```json
{"contexto":"unidade","id_uc":"UC-DEMO-001","filtros":{"periodo_atual":"2025-07/2026-06"},"indicadores":[]}
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/resposta_insight_unidade.json)**

Retorna título/texto e os quatro números do diagnóstico da UC, com os mesmos nomes e valores de `diagnostico_conta` em GET /unidades/{id}:

| nome | rótulo | unidade | período de referência |
| --- | --- | --- | --- |
| ultimo_mes | Último mês | kWh | mês analisado (ex.: 2026-06) |
| mesmo_mes_ano_anterior | Mesmo mês do ano anterior | kWh | mesmo mês, ano anterior (ex.: 2025-06) |
| media_12_meses | Média de 12 meses | kWh | 12 meses anteriores ao mês analisado (ex.: 2025-06/2026-05) |
| variacao_percentual | Variação sobre o ano anterior | % | mês analisado |

`indicadores` pode ir vazio; se enviado, precisa conter esses quatro com os valores do cenário (senão 422 `DADOS_INVALIDOS`). A exigência de seis números pertence ao insight da receita. Front refaz a consulta ao mudar filtros e descarta respostas antigas; falha de insight não bloqueia indicadores/gráficos.

## 10.1 GET /filtros — opções dos filtros de região

```http
GET /filtros
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/filtros.json)**

```json
{
  "municipios": ["CAMARAGIBE", "JABOATÃO DOS GUARARAPES", "OLINDA", "PAULISTA", "RECIFE"],
  "bairros": [{ "municipio": "RECIFE", "bairro": "BOA VISTA" }],
  "classes": ["COMERCIAL", "INDUSTRIAL", "PODER PUBLICO", "RESIDENCIAL", "RURAL"],
  "alimentadores": [{ "alimentador": "ALM-REC-001", "municipio": "RECIFE" }],
  "metadados": { "dados_ficticios": true, "gold_atualizada_em": null, "observacoes": [] }
}
```

- Valores distintos do cadastro de UCs (`gold.dim_uc`), em ordem alfabética e **exatamente como estão na Gold** (maiúsculas: `RECIFE`, `BOA VISTA`). É o valor a enviar nos parâmetros `municipio`, `bairro`, `classe` e `alimentador` das outras rotas.
- Bairro e alimentador vêm com o município: o mesmo nome de bairro existe em vários municípios (CENTRO aparece em 8). O front filtra as listas pelo município escolhido, sem nova requisição.

## 11. GET /health

```http
GET /health
```

```json
{"status":"ok"}
```

## 12. Migração V1 → V2

Esta V2 altera o contrato: `EM_ANDAMENTO` → `EM_CAMPO`, IDs de ordens inteiros, campos das ordens/resultados no modelo do Gabriel; dashboard com seis KPIs, série e ponte; IA e insight com respostas distintas.

Alinhamento com a Gold (23/10), que muda formatos para o front: `ponte_receita` passa a ter `receita_energia_comparacao`, `efeito_preco`, `efeito_volume`, `receita_energia_atual` e `reajuste_percentual` (sai `bandeira_mix`); as linhas do `drill_down` trocam `receita_atual`/`receita_comparacao` por `receita_energia_atual`/`receita_energia_comparacao`; chamados perdem `historico` e ganham `tempo_atendimento_h`; o insight da receita usa `receita_energia_atual`/`receita_energia_comparacao`.

Visão 360 (V1a, 27/10), que muda formatos para o front: `diagnostico_conta` ganha `periodo_referencia` (mês analisado) e `meses_media`, `veredito` passa a ser anulável e `media_12_meses` passa a ser a média dos 12 meses anteriores ao mês analisado; a resposta ganha `total_interrupcoes`; `consumo` tem sempre os 12 meses da janela e `consumo[].tipo_leitura` passa a ser anulável (mês sem dado da UC); pelos nulos medidos na Gold, passam a ser obrigatórios `latitude`/`longitude`, `data_encerramento`/`duracao_min` das interrupções e `subassunto`/`data_fechamento`/`tempo_atendimento_h` dos chamados, e a GD é null inteira para UC sem painel; `status` das faturas usa `EM ABERTO`/`PAGA`, e bandeira, município, bairro e classe vêm em maiúsculas, como na Gold; a busca exige 3 caracteres e `periodo_atual` da unidade, 12 meses.

Contrato, schemas, routers e fixtures do backend estão na mesma versão (V2). `backend/tests/test_stubs.py` compara a resposta de cada rota com o fixture vinculado neste documento; se um mudar sem o outro, o teste falha. Gheyson gera `types/` e mocks a partir desses fixtures (F3).

## 13. Diferenças em relação à Arquitetura V1

Decisões propostas na seção 2 do cronograma (daily de 19/10) e aplicadas nesta V2. Precisam constar na ata de aprovação, porque contrariam o texto original da Arquitetura V1.

| # | Arquitetura V1 | Contrato V2 | Origem | Validar com |
| --- | --- | --- | --- | --- |
| 1 | POST /ia devolve só `{"resposta"}` | Resposta estendida: sql, tabelas, dados, status `ok`/`nao_sei`/`bloqueado` (Tela 7, “Como cheguei nisso”) | Cronograma, seção 2, item 1 | Equipe 3 (GenAI) |
| 2 | 9 rotas | 10ª rota POST /ia/insight (bloco “Análise da IA” da Tela 2 e resumo da Tela 3) | Cronograma, seção 2, item 2 | Equipe 3 (GenAI) |
| 3 | aberta → agendada → em execução → concluída | ABERTA → EM_CAMPO → CONCLUIDA; CANCELADA a partir de ABERTA/EM_CAMPO; “agendada” vira o campo `data_prevista` | Cronograma, seção 2, item 3 (fluxo do protótipo validado) | Gabriel (já implementado no service) |

## 14. Regras provisórias e seus donos

O stub precisa de números para o front trabalhar, mas as regras abaixo **não estão decididas por este contrato**. Pertencem aos donos das fatias, que podem trocá-las sem que isso conte como mudança de contrato, desde que mantenham os nomes e formatos dos campos. Se o formato mudar, atualize este documento e o fixture no mesmo PR.

| Regra | Onde aparece | Valor no stub | Dono | Quando |
| --- | --- | --- | --- | --- |
| Agregação regional de DEC/FEC por bairro (alimentadores que atendem o bairro, ponderados por UCs) | `ranking_regional` | Ilustrativa | Arthur (R1a) | 23/10 |
| Nomes reais de tabelas Gold, SQL e auditoria do agente | `resposta_ia` (`gold_receita_demo`) | Ilustrativos | Equipe 3 (GenAI) | Contrato 20/10, módulo até 29/10 |
| Timestamp de carga da Gold | `metadados.gold_atualizada_em` | Fixo | Dados | B2 (21/10) |

Fontes ausentes não devem virar valores fictícios em produção. Telefone permanece null até existir fonte.

P1/B1 entregam contratos e stubs; não substituem B2/B3/B4/B5, O1b, V1a ou R1a. A leitura real e a persistência seguem com os responsáveis do cronograma.

## 15. Aprovação

Este documento fica como “proposta para revisão” até ser aprovado na daily. Para aprovar:

- [ ] Par A (Thiago + Gheyson): formato de período, nomes JSON e formatos dos fixtures.
- [ ] Equipe 3: itens 1 e 2 da seção 13 e as linhas dela na seção 14.
- [ ] Irvin Amilcar e Arthur: suas linhas da seção 14 (podem manter o valor ilustrativo até V1a/R1a).
- [ ] Gabriel: item 3 da seção 13 e os adaptadores de `schemas/inspecoes.py`.

Depois da aprovação, troque o título para “V2 (aprovada em DD/MM)” e registre a data na ata da daily.

## 16. Alinhamento com a Gold

A Gold não muda para atender o portal. Onde este contrato divergia dela, a API se adapta assim:

| Tema | Gold | Como a API se adapta |
| --- | --- | --- |
| Inadimplência | `valor_em_aberto`: faturas `EM ABERTO`, sem olhar o vencimento | Mesmo número, inclusive nos KPIs com filtro, com o rótulo “Valor em aberto”. O conceito de mercado (vencido e não pago) coincide nesta base, porque toda fatura em aberto já venceu |
| KPIs com filtro | `agg_kpis_mensal` é só global | Sem filtro, lê `agg_kpis_mensal`; com filtro, agrega `fato_uc_mes` + `dim_uc` com as mesmas regras, e DEC/FEC por `agg_dec_fec_mensal` |
| UCs ativas | `fato_alimentador_mes.ucs_atendidas`: UCs ligadas até o fim de cada mês | Mesma regra: UCs ligadas até o fim do último mês da janela; com filtro de bairro ou classe, contadas na `dim_uc` pela `data_ligacao` |
| Energia | `consumo_kwh_valido` no `fato_uc_mes`, somado igual em `agg_kpis_mensal` e `agg_receita_mensal` | KPI de energia e série somam `consumo_kwh_valido` |
| Ponte da receita | Só receita de energia, preço + volume sem resíduo, só P1 × P2, por município × bairro × classe | Seção 3: soma os efeitos da Gold; outras janelas ou filtro de alimentador recebem ponte null e drill-down vazio, com KPIs e série normais |
| Conta alta | `flag_conta_alta` e `variacao_pct`: consumo > 20% acima do mesmo mês do ano anterior | Seção 5: lidos sem recalcular; a API calcula a média dos 12 meses anteriores ao mês analisado, o veredito que cruza as duas comparações e o alerta (leitura estimada e troca de medidor) |
| Faturas | `status` `PAGA`/`EM ABERTO`; bandeira em maiúsculas | Seção 5: mesmos domínios; abertas sem filtro de período, pagas dentro da janela |
| Interrupções | Todas as ocorrências da UC, com `duracao_min`, `duracao_efetiva_min`, `flag_sem_interrupcao` e `flag_antes_ligacao` | Seção 5: mesmas regras do DEC/FEC (sem oscilação, sem anteriores à ligação, ≥ 3 min, duração efetiva > 0) e `duracao_efetiva_min` como duração; até 10 recentes e o total da janela |
| Chamados | Sem histórico | Seção 5: chamado sem `historico`, com `tempo_atendimento_h` |
| Fila | Ordem por score, `kwh_estimado` e `id_uc`; `posicao_fila`; listas em `motivos_json`; `confianca_evidencia` | Seção 6: mesma ordem; API mapeia `posicao_fila` → `posicao`, converte `motivos_json` em `motivos[]` e repassa `confianca_evidencia` |
| Medidor | `dim_uc` traz só o medidor ativo: id, tipo, modelo e data de instalação | Seção 5: medidor com esses campos e a última leitura do `fato_uc_mes` |

