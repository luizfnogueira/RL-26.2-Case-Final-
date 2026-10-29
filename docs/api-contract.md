# Contrato da API — V-Energy — V2 (proposta para revisão; alinhada à Gold em 23/10)

Os arquivos JSON vinculados abaixo fazem parte deste contrato e são os exemplos completos usados no Swagger. Todos são **fictícios**. As ordens de inspeção (`GET/POST/PATCH /inspecoes`) persistem no PostgreSQL. Dashboard, filtros, fila de candidatos e números do insight de receita usam a fonte selecionada por `GOLD_SOURCE`: `seed` para desenvolvimento ou `real` para a Gold importada. Unidades e operação ainda usam respostas simuladas. A geração de texto da IA é configurada separadamente por `IA_MODO`.

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
| GET /unidades | busca (ID ou titular, 1–100 caracteres); município, bairro, classe, alimentador; page, page_size |
| GET /unidades/{id} | periodo_atual opcional; no mock o padrão é 2025-07/2026-06 |
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

Items: id_uc, nome_titular, município, bairro, classe, alimentador e status. Busca por ID/titular; ordenação por ID. Sem correspondência: lista vazia.

## 5. GET /unidades/{id} — Tela 3

```http
GET /unidades/UC-DEMO-001?periodo_atual=2025-07/2026-06
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/unidade.json)**

- Fontes na Gold: cadastro, medidor ativo e GD da `dim_uc`; faturas, última leitura e `tipo_leitura` do `fato_uc_mes`; consumo comparativo da `uc_consumo_comparativo`; interrupções da `uc_interrupcoes`; chamados da `uc_atendimentos`.
- Cadastro, CPF/CNPJ mascarado e telefone anulável (não há telefone na fonte bruta inspecionada). `cep` e `data_ligacao` também são anuláveis.
- `consumo`: 12 pares de mês atual/mesmo mês do ano anterior, ambos com unidade e referência, mais `tipo_leitura` (`REAL`, `ESTIMADA`, `MEDIA`, `AUTENTICADA` ou `NAO REALIZADA`). O ano anterior é null quando a UC não tem leitura naquele mês.
- `diagnostico_conta`: conta_alta (bool/null), veredito, último mês, mesmo mês do ano anterior, média de 12 meses, variação percentual, leitura_estimada e alerta. `conta_alta` vem de `gold.uc_consumo_comparativo.flag_conta_alta`: consumo do último mês **mais de 20% acima** do mesmo mês do ano anterior; null quando não há ano anterior ou algum dos consumos é ≤ 0. A média de 12 meses e o alerta de leitura estimada são calculados pela API a partir do `fato_uc_mes`.
- Faturas abertas e pagas (valores em BRL), medidor ativo (id, modelo, tipo, data de instalação e última leitura), GD, interrupções recentes e chamados com nota e `tempo_atendimento_h`. Exemplo tem 1 fatura aberta e 1 paga; a UI conta o que recebeu.
- Média mensal injetada de GD não é geração medida no período. O exemplo é um caso fictício que segue a regra da Gold.

No mock, somente UC-DEMO-001 tem a visão detalhada. IDs não disponíveis retornam 404. Nunca atribuir o cadastro de uma UC a outro ID.

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
  "pergunta": "Qual foi a receita no período?",
  "conversa_id": "8f14e45f-ceea-4b67-9c2a-5d3f1a2b6c7d"
}
```

`conversa_id` (UUID) é opcional. Na primeira pergunta o front não envia o campo: o backend cria o id e o devolve na resposta. Nas perguntas seguintes, o front reenvia o mesmo id, e o agente usa as últimas trocas daquela conversa (até 3, guardadas no servidor) para entender perguntas de continuação ("E só comercial?"). Em conversa mais longa, ele recebe também a lista das 10 perguntas anteriores, montada pelo backend a partir do log (sem chamar o modelo e sem sair do servidor), para responder "qual foi o primeiro município que perguntei?". “Limpar conversa” no front começa uma conversa nova. Um id desconhecido ou expirado (mais de 2 h sem perguntas) abre uma conversa nova, sem erro.

**200 — [JSON completo da resposta](../backend/app/services/fixtures/resposta_ia.json)**

Resposta: resposta, sql (string/null), tabelas[], dados{colunas[], linhas[][]}, status (`ok`, `nao_sei`, `bloqueado`, `esclarecer`), gerado_em e metadados. Linhas seguem a ordem de colunas. O bloco “Como cheguei nisso” usa esses três campos de auditoria, não raciocínio interno do agente.

Campos da sprint de GenAI (GENAI-3), todos opcionais. O mock e respostas sem eles continuam válidos:

| Campo | Tipo | Para quê |
| --- | --- | --- |
| `conversa_id` | UUID | Memória da conversa (ver acima). |
| `apresentacao` | `"texto"`, `"tabela"` ou `"grafico"` | Com `tabela`, a Tela 7 mostra `dados` como tabela no corpo da resposta. Regra do agente: várias linhas, ou 1 linha com 3 ou mais colunas, vão em tabela; status diferente de `ok` vai sempre em texto. Até 50 linhas, e o texto informa o total real. Com `grafico`, a Tela 7 desenha o campo `grafico` (abaixo). |
| `detalhes_tecnicos` | objeto | Painel “Detalhes técnicos” da resposta. |
| `grafico` | objeto ou `null` | Gráfico da resposta; presente se, e só se, `apresentacao` for `"grafico"`. |
| `esclarecimento` | objeto ou `null` | Pergunta e opções; presente se, e só se, `status` for `"esclarecer"`. |

**Pedir esclarecimento.** Pergunta ambígua volta com `status: "esclarecer"`, sem consulta ao banco e sem chamar o modelo (zero tokens). A API detecta dois casos:

| Caso | Exemplo | Opções |
| --- | --- | --- |
| Bairro que existe em 2 municípios ou mais, sem o município na pergunta nem na troca anterior | "Qual a receita do Centro?" (o Centro existe em 10 municípios da Gold) | Um botão por município (até 8) e "Todos os municípios juntos" |
| "Este ano", "deste ano", "no ano atual" sem ano nem P1/P2 | "Quais bairros tiveram mais falta de luz este ano?" | "2026 (jan a jun)" e "P2 (jul/2025 a jun/2026)", porque a base termina em jun/2026 |

```json
{
  "status": "esclarecer",
  "resposta": "O bairro Centro existe em 3 municípios. De qual você quer saber?",
  "esclarecimento": {
    "pergunta": "O bairro Centro existe em 3 municípios. De qual você quer saber?",
    "opcoes": [
      {"rotulo": "Centro de Recife", "pergunta": "Qual a receita do Centro (bairro Centro, em Recife)?"},
      {"rotulo": "Todos os municípios juntos", "pergunta": "Qual a receita do Centro (bairro Centro, somando todos os municípios)?"}
    ]
  }
}
```

`opcoes` tem de 2 a 10 itens. Cada `pergunta` já vem completa: o front a envia como uma pergunta nova, na mesma conversa, e ela não pede esclarecimento de novo. A troca `esclarecer` vai para o log em `ia.interacao`, mas não entra na memória da conversa. [Exemplo completo (bairro)](../backend/app/services/fixtures/resposta_ia_esclarecer.json), [exemplo do ano](../backend/app/services/fixtures/resposta_ia_esclarecer_ano.json).

**Gráfico na conversa.** Quem decide o tipo é o backend, pela forma de `dados` e pela pergunta; o modelo não desenha nem escreve número. Os valores de `grafico` são células de `dados`, que vêm do banco, já ordenados e cortados no limite. Regras (Nastengraph, *Bar/Pie/Line charts best practices*):

| Situação | Gráfico |
| --- | --- |
| Comparação P1 × P2 (colunas `..._p1`/`..._p2` ou coluna `periodo`), sem pedido | Barras: verticais com P1 e P2; horizontais com P1 e P2 lado a lado quando há uma categoria. Ordem natural (P1 → P2), categorias do maior para o menor pelo P2 |
| Série no tempo (`mes_referencia`, `ano`, `mes`, `data_*`), sem pedido | Linhas com 3 meses ou mais, até 48 pontos e 4 linhas; 2 pontos viram barras verticais. Mês sem dado é `null` (buraco na linha) |
| Pessoa pede "gráfico", "barras", "pizza" ou "linhas" | O tipo pedido quando faz sentido. Categorias viram barras horizontais, do maior para o menor (ou na ordem do SQL, quando já vem ordenada), até 20 |
| Pizza pedida | Só com totais somáveis (receita, kWh, contagens), nunca médias, taxas, DEC ou percentuais; até 5 fatias, da maior para a menor, com "Outros" no fim. Fatias quase iguais, médias ou períodos viram barras, com a explicação em `nota` |
| Linhas pedidas sem tempo | Barras, com a explicação em `nota` |
| Ranking ou lista sem pedido, ou um número só | Sem gráfico (tabela ou texto). Com pedido e um número só, `metadados.observacoes` explica |

Campos de `grafico`:

| Campo | Valores | Para quê |
| --- | --- | --- |
| `tipo` | `barras`, `pizza`, `linhas` | Forma do gráfico |
| `titulo` | texto (até 150) | A pergunta interpretada |
| `eixo` | `categoria`, `tempo`, `periodo` | Como o front formata as categorias: nomes da Gold (`formatarNome`), meses (`2025-07` → `Jul/2025`) ou P1/P2 como estão |
| `orientacao` | `horizontal`, `vertical` ou `null` | Obrigatória nas barras; `null` na pizza e nas linhas |
| `unidade` | `brl`, `kwh`, `pct`, `h` ou `null` | Uma unidade por gráfico, pelo sufixo do alias do SQL; nunca dois eixos |
| `categorias` | 1 a 48 textos | Eixo das barras e das linhas, ou as fatias |
| `series` | 1 a 4 itens `{nome, valores[]}` | Um valor (número ou `null`) por categoria, na mesma ordem. Pizza: 1 série, sem negativos nem `null` |
| `origem` | `automatico`, `pedido` | Se veio da forma dos dados ou de um pedido da pessoa |
| `omitidos` | inteiro ≥ 0 | Categorias ou séries fora do limite; a tabela completa segue em `dados` e no CSV |
| `nota` | texto ou `null` | Por que o tipo pedido não foi usado (ex.: pizza de média) |

Exemplos completos (valores fictícios): [barras P1 × P2](../backend/app/services/fixtures/resposta_ia_grafico_barras.json), [pizza](../backend/app/services/fixtures/resposta_ia_grafico_pizza.json), [linhas](../backend/app/services/fixtures/resposta_ia_grafico_linhas.json). Um gráfico que não passe nessas regras é descartado e a resposta sai como tabela ou texto, nunca 503.

Blocos de `detalhes_tecnicos`. Campos novos da telemetria são aceitos e o front os ignora:

| Bloco | Conteúdo |
| --- | --- |
| `estrutura_pensamento` | `pergunta_interpretada`, `plano` (`tabelas`, `colunas`, `filtros`, `agregacao`, `ordenacao`, `limite`, `periodo`), `skills`, `premissas` e `justificativa` (declarada pelo modelo, e assim rotulada na tela) |
| `acoes[]` | Ferramentas chamadas pelo agente, em ordem: `ordem`, `ferramenta`, `argumentos`, `resumo_retorno`, `sucesso` |
| `consulta` | `sql_executado`, `tentativas` e `linhas` |
| `tokens_tempo` | `tokens_entrada`, `tokens_saida`, `tokens_raciocinio`, `chamadas`, `latencia_total_ms`, `etapas_ms{}`, `modelo`, `provedor` e `cache` |
| `verificacoes` | `sql_validado`, `numeros_conferidos` e `confianca` (`alta`, `media` ou `baixa`) |
| `avaliacao` | Resumo do último run da avaliação (`avaliacao_ultima.json`, GENAI-27) ou `null` quando ainda não houve. Chaves esperadas: `executado_em`, `n_perguntas`, `configuracao`, `acuracia_execucao`, `taxa_invencao`, `bloqueio_ataques`, `f1_macro` e `por_status{ok, nao_sei, bloqueado}` com `precisao`, `recall` e `f1` (razões de 0 a 1). |

As métricas de `avaliacao` medem o conjunto de perguntas com gabarito, não esta resposta. As verificações desta resposta ficam em `verificacoes`.

Cenários demonstrativos:

| Pergunta | Status / resposta completa |
| --- | --- |
| Qual foi a receita no período? | ok — exemplo acima |
| Qual a previsão de lucro em 2030? | [nao_sei](../backend/app/services/fixtures/resposta_ia_nao_sei.json) |
| DROP TABLE clientes | [bloqueado](../backend/app/services/fixtures/resposta_ia_bloqueado.json) |
| Pergunta com "gráfico", "barras", "pizza" ou "linhas" | ok — um exemplo de cada tipo (links acima) |
| Qual a receita do Centro? / Qual foi a receita deste ano? | esclarecer — exemplos acima (no mock, "Centro" é um bairro fictício de Recife, Olinda e Paulista) |

A API é a ponte com o agente de IA da Equipe 3, escolhido pela variável `IA_MODO` do `.env`:

- `mock` (padrão): os cenários acima, sem chamar o agente; outras perguntas retornam nao_sei. A demonstração de bloqueio não substitui as proteções do agente real.
- `real`: a pergunta vai para o agente PydanticAI da Equipe 3, que roda dentro do backend, sem chamada HTTP. Ele gera e executa a consulta somente leitura na Gold, com o usuário do banco próprio do agente. A API carrega as últimas trocas da conversa e grava cada resposta, inclusive `bloqueado` e `nao_sei`, em `ia.interacao`, que também serve de log de auditoria.

**Respostas pré-calculadas.** Em `IA_MODO=real`, uma resposta `ok` de pergunta sem histórico fica guardada em `ia.resposta_cache`, por versão da Gold. Uma pergunta nova igual ou muito parecida (texto 90% semelhante, sem acento, pontuação e palavras vazias) e com os mesmos nomes da Gold, números, P1/P2, meses e qualificadores (maior/menor, média/total, gráfico) recebe essa resposta sem chamar o modelo. "Receita comercial em Jaboatão" e "em Olinda" nunca se confundem. No reaproveitamento, `detalhes_tecnicos.tokens_tempo.cache` vem `true`, com tokens e chamadas zerados, e `metadados.observacoes` cita a pergunta original. O gráfico é montado de novo para a pergunta nova. Recarregar a Gold esvazia o cache; `AI_CACHE_ENABLED=0` desliga.

Em qualquer modo, a API confere a resposta contra este formato antes de devolvê-la. Agente fora do ar, sem resposta dentro do `IA_TIMEOUT_S` (o agente tem 5 s a menos, para sobrar tempo de gravar) ou com resposta fora do formato: 503 `AGENTE_INDISPONIVEL`, com mensagem amigável. A chave do modelo fica só no `.env` do backend, nunca na resposta. Nome `gold_receita_demo` e SQL do exemplo são ilustrativos.

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

**Insight da receita (B5).** Só existe para `periodo_atual=2025-07/2026-06` × `periodo_comparacao=2022-07/2023-06`, sem `alimentador` e em recorte com decomposição na Gold; fora disso, 422 `DECOMPOSICAO_INDISPONIVEL`. Nomes de município e bairro vão como estão no banco (a Gold usa maiúsculas, ex.: `RECIFE`, `BOA VISTA`). O texto vem do agente de insight da Equipe 3 (`IA_MODO=real`, dentro do backend, com prazo de `IA_TIMEOUT_S` − 5 s) ou de um texto por regra (`IA_MODO=mock`). **Diferente do chat, falha do módulo não vira 503:** fora do ar, lento além do `IA_TIMEOUT_S`, erro HTTP ou resposta fora de `{titulo, texto}` devolvem 200 com um texto alternativo montado por regra sobre os mesmos números, e `metadados.observacoes` ganha uma linha começando por `Texto alternativo:`. O front usa esse prefixo para não rotular o texto como gerado por IA.

Agente de insight (GENAI-25, `backend/app/ai/insights.py`): recebe os seis números já formatados (mais o recorte e os períodos) e escreve título e texto com marcadores, como `{efeito_preco}`. O código troca cada marcador pelo valor da Gold, então nenhum número do texto sai do modelo. Algarismo fora de marcador ou marcador inexistente pedem uma nova tentativa; se o erro se repetir, vale o texto alternativo. `IA_INSIGHT_URL` não é mais usada.

Para UC360:

```json
{"contexto":"unidade","id_uc":"UC-DEMO-001","filtros":{"periodo_atual":"2025-07/2026-06"},"indicadores":[]}
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/resposta_insight_unidade.json)**

Retorna título/texto e os quatro números do diagnóstico da UC, com os mesmos nomes e valores de `diagnostico_conta` em GET /unidades/{id}:

| nome | rótulo | unidade | período de referência |
| --- | --- | --- | --- |
| ultimo_mes | Último mês | kWh | último mês (ex.: 2026-06) |
| mesmo_mes_ano_anterior | Mesmo mês do ano anterior | kWh | mesmo mês, ano anterior (ex.: 2025-06) |
| media_12_meses | Média de 12 meses | kWh | janela de 12 meses (ex.: 2025-07/2026-06) |
| variacao_percentual | Variação sobre o ano anterior | % | último mês |

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
| Conta alta | `flag_conta_alta`: consumo > 20% acima do mesmo mês do ano anterior | Seção 5: veredito pela flag; média de 12 meses e alerta de leitura estimada calculados pela API |
| Chamados | Sem histórico | Seção 5: chamado sem `historico`, com `tempo_atendimento_h` |
| Fila | Ordem por score, `kwh_estimado` e `id_uc`; `posicao_fila`; listas em `motivos_json`; `confianca_evidencia` | Seção 6: mesma ordem; API mapeia `posicao_fila` → `posicao`, converte `motivos_json` em `motivos[]` e repassa `confianca_evidencia` |
| Medidor | `dim_uc` traz só o medidor ativo: id, tipo, modelo e data de instalação | Seção 5: medidor com esses campos e a última leitura do `fato_uc_mes` |

