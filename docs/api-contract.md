# Contrato da API — V-Energy — V2 (proposta para revisão)

Os arquivos JSON vinculados abaixo fazem parte deste contrato e são os exemplos completos usados no Swagger. Todos são **fictícios**. Backend real/Gold/agente não estão implementados nesta entrega.

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
| GET /operacao | periodo_atual obrigatório; município, bairro, alimentador; ordenar_por=dec|fec; nivel_regional=municipio|bairro; page, page_size |
| POST /ia | pergunta; contexto opcional com períodos/filtros |
| POST /ia/insight | contexto=receita|unidade; filtros; indicadores; id_uc para resumo da unidade |

Os parâmetros sem indicação de obrigatoriedade são opcionais. Classe não está disponível no mock operacional e retorna erro explícito se enviada. Filtros de bairro em operação selecionam os alimentadores que atendem o bairro; não recalculam seu denominador.

### Limites dos stubs

Os cenários analíticos estão preparados para as duas janelas anuais acima. Outros intervalos sintaticamente válidos — inclusive um mês isolado (`YYYY-MM`) — retornam **422 `CENARIO_STUB_INDISPONIVEL`**, em vez de devolver números de outro período. Isso é limite do stub, não do formato: `YYYY-MM` continua válido no contrato (por exemplo, no filtro `periodo_atual` de GET /inspecoes, que não depende de cenário) e a integração real deverá atender os intervalos, mensais ou não, disponíveis na Gold.

Filtros e paginação operam sobre exemplos locais. Dashboard possui recortes fictícios por município → bairro → classe; os valores regionais são distribuição ilustrativa do consolidado. Não representam metodologia ou diagnóstico real. POST/PATCH usam snapshot: alterações não persistem entre chamadas. Não existe SQL executável nem agente conectado.

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
| 500 | ERRO_INTERNO | Falha inesperada, sem detalhes internos na resposta |

`AppException` e HTTPException passam pelo handler comum. Os códigos de domínio seguem `app/core/exceptions.py`; falhas 503 de fonte/agente serão usadas na integração real. `nao_sei` e `bloqueado` são estados válidos de resposta da IA (HTTP 200), não erros de transporte.

## 3. GET /dashboard — Telas 1 e 2

```http
GET /dashboard?periodo_atual=2025-07/2026-06&periodo_comparacao=2022-07/2023-06
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/dashboard.json)**

- `indicadores`: exatamente seis KPIs — receita_faturada, energia_faturada, ucs_ativas, inadimplencia, dec_medio, fec_medio. Cada um tem atual, comparação, diferença e variação percentual; campos não aplicáveis retornam null.
- Inadimplência inclui percentual da receita em cada período e variação em pontos percentuais. DEC/FEC incluem metas ilustrativas, não limites regulatórios certificados.
- `serie_historica`: 48 pontos mensais, jul/2022–jun/2026, cada um com receita e energia. A janela da série é independente das duas janelas de comparação.
- `ponte_receita`: receita_comparacao + efeito_preco + efeito_volume + bandeira_mix = receita_atual. Exemplo: 263,6 + 27,7 − 10,4 + 3,8 = 284,7 milhões. Inclui reajuste_percentual.
- `drill_down`: nível, breadcrumb e lista paginada; receita, volume, variação, queda em kWh, efeitos em BRL e filtros para cada linha. Ordenado por maior queda absoluta em kWh, depois nome.
- Nível bairro exige município; nível classe exige município e bairro. Ao selecionar uma linha, reenviar seus filtros com o próximo nível. Remover filtros descendentes ao voltar pelo breadcrumb.

```http
GET /dashboard?periodo_atual=2025-07/2026-06&periodo_comparacao=2022-07/2023-06&nivel=bairro&municipio=Recife
GET /dashboard?periodo_atual=2025-07/2026-06&periodo_comparacao=2022-07/2023-06&nivel=classe&municipio=Recife&bairro=Boa%20Vista
```

Na integração, a API lê os efeitos pré-calculados na Gold. O cálculo de distribuição do mock não é a implementação B3b.

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

- Cadastro, CPF/CNPJ mascarado e telefone anulável (não há telefone na fonte bruta inspecionada).
- `consumo`: 12 pares de mês atual/mesmo mês do ano anterior, ambos com unidade e referência, mais `tipo_leitura`.
- `diagnostico_conta`: conta_alta (bool/null), veredito, último mês, mesmo mês do ano anterior, média de 12 meses, variação percentual, leitura_estimada e alerta.
- Faturas abertas e pagas, medidor com última leitura, GD, interrupções recentes e chamados com nota/histórico. Exemplo tem 1 fatura aberta e 1 paga; a UI conta o que recebeu.
- Média mensal injetada de GD não é geração medida no período. Diagnóstico é um caso fictício; limiar/regra real pertence à V1a e deve ser acordado pelo responsável.

No mock, somente UC-DEMO-001 tem a visão detalhada. IDs não disponíveis retornam 404. Nunca atribuir o cadastro de uma UC a outro ID.

## 6. GET /inspecoes/candidatos — Tela 4

```http
GET /inspecoes/candidatos?periodo_atual=2025-07/2026-06&page=1&page_size=20
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/candidatos.json)**

`resumo`: UCs analisadas, priorizadas, potencial de recuperação e ordens ativas, com unidade/período, antes da paginação. Cada candidato: ID, localização, classe, alimentador, posição, motivos[], energia estimada, score (0–100), ordem_ativa e id_ordem_ativa.

Ordenar por score decrescente, ID como desempate; posição global após filtros. Desabilitar seleção de UC com ordem ativa no front; POST também valida duplicidade. Estimativa futura não é o kWh já recuperado do histórico.

## 7. Ordens — Telas 4 e 5

Reutiliza os modelos e regras do Gabriel (`schemas/inspecao.py`), com adaptadores de transporte em `schemas/inspecoes.py`. Não modifica o service/repository dele.

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

Snapshot de teste: 1 ABERTA/UC-DEMO-002; 2 EM_CAMPO/UC-DEMO-005; 3 CONCLUIDA; 4 CANCELADA. Criar UC-DEMO-001 funciona; criar 002/005 retorna 409. Um PATCH não altera esse snapshot para chamadas seguintes.

## 8. GET /operacao — Tela 6

```http
GET /operacao?periodo_atual=2025-07/2026-06&ordenar_por=dec&page=1&page_size=20
```

**200 — [JSON completo da resposta](../backend/app/services/fixtures/operacao.json)**

- `serie_historica`: DEC e FEC mensais por alimentador.
- `ranking_alimentadores`: lista paginada com DEC, FEC, número de interrupções, UCs atendidas, município e bairros atendidos.
- `ranking_regional`: lista paginada com DEC, FEC e interrupções; `nivel_regional=municipio` (padrão, bairro null) ou `bairro` (município e bairro preenchidos).
- Rankings ordenados pelo indicador escolhido, decrescente. Mesmo page/page_size aplicado independentemente a cada ranking; totais próprios. A série não é truncada pela paginação.
- Clicar em um alimentador reconsulta com `alimentador`, filtrando série e rankings. O mock tem 12 pontos por alimentador; os totais de DEC/FEC correspondem à soma mensal fictícia.

## 9. POST /ia — Tela 7 e painel flutuante

```http
POST /ia
Content-Type: application/json
```

```json
{
  "pergunta": "Qual foi a receita no período?",
  "contexto": {
    "periodo_atual": "2025-07/2026-06",
    "periodo_comparacao": "2022-07/2023-06",
    "municipio": null,
    "bairro": null,
    "classe": null,
    "alimentador": null
  }
}
```


**200 — [JSON completo da resposta](../backend/app/services/fixtures/resposta_ia.json)**

Resposta: resposta, sql (string/null), tabelas[], dados{colunas[], linhas[][]}, status (`ok`, `nao_sei`, `bloqueado`), gerado_em e metadados. Linhas seguem a ordem de colunas. O bloco “Como cheguei nisso” usa esses três campos de auditoria, não raciocínio interno do agente.

Cenários demonstrativos:

| Pergunta | Status / resposta completa |
| --- | --- |
| Qual foi a receita no período? + contexto do exemplo | ok — exemplo acima |
| Qual a previsão de lucro em 2030? | [nao_sei](../backend/app/services/fixtures/resposta_ia_nao_sei.json) |
| DROP TABLE clientes | [bloqueado](../backend/app/services/fixtures/resposta_ia_bloqueado.json) |

Outras perguntas retornam nao_sei no stub. Não há agente, parser SQL de segurança ou execução de comandos. A demonstração de bloqueio não substitui as proteções da integração real. Nome `gold_receita_demo` e SQL são ilustrativos; validar os nomes reais com Equipe 3.

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
      "nome": "receita_atual",
      "rotulo": "Receita atual",
      "valor": 284700000,
      "unidade": "BRL",
      "periodo_referencia": "2025-07/2026-06"
    },
    {
      "nome": "receita_comparacao",
      "rotulo": "Receita base",
      "valor": 263600000,
      "unidade": "BRL",
      "periodo_referencia": "2022-07/2023-06"
    },
    {
      "nome": "variacao_volume",
      "rotulo": "Volume",
      "valor": -3.8986,
      "unidade": "%",
      "periodo_referencia": "2025-07/2026-06"
    },
    {
      "nome": "reajuste",
      "rotulo": "Reajuste",
      "valor": 10.5,
      "unidade": "%",
      "periodo_referencia": "2025-07/2026-06"
    },
    {
      "nome": "efeito_preco",
      "rotulo": "Efeito-preço",
      "valor": 27700000,
      "unidade": "BRL",
      "periodo_referencia": "2025-07/2026-06"
    },
    {
      "nome": "efeito_volume",
      "rotulo": "Efeito-volume",
      "valor": -10400000,
      "unidade": "BRL",
      "periodo_referencia": "2025-07/2026-06"
    }
  ]
}
```


**200 — [JSON completo da resposta](../backend/app/services/fixtures/resposta_insight.json)**

Resposta separada do chat: `titulo`, `texto`, `numeros_utilizados[]` (nome, rótulo, valor, unidade, período), gerado_em e metadados com atualização da Gold.

Receita usa **seis números**: receita atual, receita base, variação do volume, reajuste, efeito-preço e efeito-volume. Os números enviados são opcionais no stub; se presentes, precisam corresponder aos seis do cenário. Na integração, validar contra a Gold, não confiar em valores arbitrários do navegador.

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

## 11. GET /health

```http
GET /health
```

```json
{"status":"ok"}
```

## 12. Migração V1 → V2

Esta V2 altera o contrato: `EM_ANDAMENTO` → `EM_CAMPO`, IDs de ordens inteiros, campos das ordens/resultados no modelo do Gabriel; dashboard com seis KPIs, série e ponte; IA e insight com respostas distintas.

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
| Veredito “conta alta” (limiar e comparação) | `diagnostico_conta` | Ilustrativo (último mês acima do ano anterior e da média) | Irvin Amilcar (V1a) | 22–23/10 |
| Agregação regional de DEC/FEC (média ponderada por UCs, sem recalcular denominador por bairro) | `ranking_regional` | Ilustrativa | Arthur (D-R/R1a) | 21–23/10 |
| Metas de DEC/FEC | `dec_medio.meta`, `fec_medio.meta` | 12,0 h e 7,5 interrupções (ilustrativas) | Arthur | 23/10 |
| Decomposição preço/volume/bandeira-mix | `ponte_receita`, `drill_down` | Distribuição ilustrativa do consolidado | Dono da Gold de receita (Equipe 3, seção 2, item 6) | Amostra 23/10, final 26/10 |
| Score e motivos da fila; corte de priorização (score ≥ 60) | `candidatos` | Ilustrativos | Equipe 3 (Gold da fila) e Gabriel (A1) | 26/10 |
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
