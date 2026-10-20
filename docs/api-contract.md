# Contrato da API — V-Energy — V1

**Status: proposta para revisão de Thiago e Gheyson. Não aprovado.**

Dez rotas funcionais (nove da arquitetura + `/ia/insight`) e `/health`. **Exemplos fictícios para mocks/stubs.** Decisões pendentes estão no final.

## 1. Convenções

### 1.1 Formatos

- JSON em `snake_case`; IDs como strings.
- Datas: `YYYY-MM-DD`; instantes: ISO 8601 com fuso.
- Números sem formatação; valores monetários com arredondamento para duas casas.
- `null`: informação ausente em campo anulável; `0`: zero conhecido; `[]`: lista vazia.
- Indicadores incluem `valor`, `unidade` e `periodo_referencia`.
- Campos extras em corpos de escrita: `422`. PATCH preserva campos não enviados.

### 1.2 Filtros e períodos

Períodos mensais `YYYY-MM` nesta proposta; intervalos maiores dependem de revisão.

| Parâmetro | Tipo | Regra |
| --- | --- | --- |
| `periodo_atual` | string `YYYY-MM` | Obrigatório no dashboard, operação, candidatos e contexto de IA. Opcional em UC360 e listagem de ordens. |
| `periodo_comparacao` | string `YYYY-MM` | Obrigatório no dashboard; opcional em candidatos e contexto de IA. Deve ser diferente do período atual. |
| `municipio` | string | Opcional; valor normalizado a combinar com Dados. |
| `bairro` | string | Opcional; nesta proposta exige `municipio`, para evitar ambiguidade. |
| `classe` | string | Opcional; valores normalizados a combinar com Dados. |
| `alimentador` | string | Opcional; identificador do alimentador. |
| `page` | inteiro | Padrão `1`; mínimo `1`. |
| `page_size` | inteiro | Padrão `20`; entre `1` e `100`. |

Filtros combinados usam **AND**. Sem correspondência: listas vazias ou indicadores indisponíveis.

`total`: quantidade após filtros, antes da paginação. Página fora do resultado: `items: []`, mantendo `total`.

### 1.3 Matriz de filtros

| Rota | Parâmetros aceitos |
| --- | --- |
| `GET /dashboard` | `periodo_atual`, `periodo_comparacao`, `municipio`, `bairro`, `classe`, `alimentador` |
| `GET /unidades` | `busca`, `municipio`, `bairro`, `classe`, `alimentador`, `page`, `page_size` |
| `GET /unidades/{id}` | `periodo_atual` opcional |
| `GET /inspecoes/candidatos` | `periodo_atual`, `periodo_comparacao`, `municipio`, `bairro`, `classe`, `alimentador`, `page`, `page_size` |
| `GET /inspecoes` | `id_uc`, `status`, `periodo_atual`, `municipio`, `bairro`, `classe`, `alimentador`, `page`, `page_size` |
| `GET /operacao` | `periodo_atual`, `alimentador`, `page`, `page_size` |

`/operacao` aceita recorte por alimentador, sem filtros por bairro/classe.

## 2. Erros

Formato único:

```json
{
  "codigo": "UNIDADE_NAO_ENCONTRADA",
  "mensagem": "A unidade solicitada não foi encontrada."
}
```

| HTTP | Código proposto | Uso |
| --- | --- | --- |
| `404` | `UNIDADE_NAO_ENCONTRADA` | ID de unidade inexistente. |
| `404` | `ORDEM_NAO_ENCONTRADA` | ID de ordem inexistente. |
| `404` | `RECURSO_NAO_ENCONTRADO` | Rota/recurso inexistente. |
| `405` | `METODO_NAO_PERMITIDO` | Método incompatível com a rota. |
| `409` | `ORDEM_ATIVA_EXISTENTE` | Outra ordem aberta/em andamento para a mesma UC. |
| `409` | `TRANSICAO_STATUS_INVALIDA` | Alteração incompatível com o status atual. |
| `422` | `DADOS_INVALIDOS` | Formato, campo ou combinação de campos inválidos. |
| `503` | `DADOS_INDISPONIVEIS` | Fonte necessária à operação indisponível. |
| `503` | `IA_INDISPONIVEL` | Agente indisponível. |
| `500` | `ERRO_INTERNO` | Falha inesperada; detalhe técnico somente no log. |

Rotas/services informam o erro; o handler padroniza a resposta.

## 3. GET /dashboard

**Finalidade:** indicadores de receita e consumo, comparação mensal, decomposição preço-volume e recorte por região/classe.

Requisição sem corpo:

```http
GET /dashboard?periodo_atual=2026-09&periodo_comparacao=2026-08&municipio=Recife&classe=Residencial
```

Resposta `200`:

```json
{
  "filtros": {
    "periodo_atual": "2026-09",
    "periodo_comparacao": "2026-08",
    "municipio": "Recife",
    "bairro": null,
    "classe": "Residencial",
    "alimentador": null
  },
  "indicadores": {
    "receita_faturada": {
      "atual": {"valor": 120000.0, "unidade": "BRL", "periodo_referencia": "2026-09"},
      "comparacao": {"valor": 100000.0, "unidade": "BRL", "periodo_referencia": "2026-08"},
      "variacao_percentual": {"valor": 20.0, "unidade": "%", "periodo_referencia": "2026-09"}
    },
    "consumo": {
      "atual": {"valor": 150000.0, "unidade": "kWh", "periodo_referencia": "2026-09"},
      "comparacao": {"valor": 125000.0, "unidade": "kWh", "periodo_referencia": "2026-08"},
      "variacao_percentual": {"valor": 20.0, "unidade": "%", "periodo_referencia": "2026-09"}
    }
  },
  "analise_preco_volume": {
    "periodo_atual": "2026-09",
    "periodo_comparacao": "2026-08",
    "status": "indisponivel",
    "motivo_indisponibilidade": "METODOLOGIA_PENDENTE",
    "efeito_preco": {"valor": null, "unidade": "BRL", "periodo_referencia": "2026-09"},
    "efeito_volume": {"valor": null, "unidade": "BRL", "periodo_referencia": "2026-09"}
  }
}
```

Regras:

- Receita proposta: soma de `valor_total` das faturas elegíveis da competência; consumo: total mensal tratado. Critérios e metodologia ainda precisam de aprovação.
- Variação com denominador zero/ausente ou indicador sem registros: `valor: null`. Falha da fonte: `503`.
- Preço-volume: `disponivel` com valores e motivo `null`; sem metodologia, `indisponivel` e valores `null`.

## 4. GET /unidades

**Finalidade:** buscar e paginar o cadastro.

`busca`: ID da UC ou titular, de 1 a 100 caracteres. Ordenação: `id_uc` crescente.

```http
GET /unidades?municipio=Recife&classe=Residencial&page=1&page_size=20
```

Resposta `200`:

```json
{
  "items": [
    {
      "id_uc": "UC-DEMO-001",
      "nome_titular": "Titular de exemplo",
      "municipio": "Recife",
      "bairro": "Boa Vista",
      "classe": "Residencial",
      "alimentador": "ALM-DEMO-001",
      "status": "ATIVA"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

Sem correspondências: `200`, `items: []`, `total: 0`.

## 5. GET /unidades/{id}

**Finalidade:** visão 360 da unidade, com cadastro e registros relacionados.

`id`: ID da UC. Sem `periodo_atual`, usar a última competência disponível. Consumo: até 12 meses encerrando na referência. Faturas: competência selecionada; interrupções/chamados: mês de abertura. Medidores: histórico disponível; geração: cadastro com data de conexão.

```http
GET /unidades/UC-DEMO-001?periodo_atual=2026-09
```

Resposta `200`:

```json
{
  "periodo_referencia": "2026-09",
  "cadastro": {
    "id_uc": "UC-DEMO-001",
    "nome_titular": "Titular de exemplo",
    "logradouro": "Rua de Exemplo",
    "numero": "100",
    "bairro": "Boa Vista",
    "municipio": "Recife",
    "uf": "PE",
    "cep": "00000000",
    "classe": "Residencial",
    "subgrupo_tarifario": "B1",
    "alimentador": "ALM-DEMO-001",
    "data_ligacao": "2022-07-01",
    "status": "ATIVA",
    "latitude": null,
    "longitude": null
  },
  "consumo": [
    {"valor": 250.0, "unidade": "kWh", "periodo_referencia": "2026-08"},
    {"valor": 300.0, "unidade": "kWh", "periodo_referencia": "2026-09"}
  ],
  "faturas": [
    {
      "id_fatura": "FT-DEMO-001",
      "mes_referencia": "2026-09",
      "valor_energia": 180.0,
      "tributos": 60.0,
      "valor_total": 240.0,
      "moeda": "BRL",
      "bandeira_tarifaria": "Verde",
      "data_emissao": "2026-09-27",
      "data_vencimento": "2026-10-08",
      "data_pagamento": null,
      "status": "ABERTA"
    }
  ],
  "medidores": [
    {
      "id_medidor": "MD-DEMO-001",
      "modelo": "MODELO-DEMO",
      "tipo": "ELETRONICO",
      "data_instalacao": "2022-07-01",
      "data_retirada": null,
      "data_ultima_manutencao": null,
      "status": "ATIVO"
    }
  ],
  "geracao_distribuida": [
    {
      "potencia_kwp": 5.0,
      "data_conexao": "2025-02-01",
      "modalidade": "GERACAO NA PROPRIA UC",
      "energia_injetada_kwh_media_mensal": 200.0
    }
  ],
  "interrupcoes": [
    {
      "id_ocorrencia": "OC-DEMO-001",
      "alimentador": "ALM-DEMO-001",
      "tipo": "FALTA DE ENERGIA",
      "causa": "NAO IDENTIFICADA",
      "data_abertura": "2026-09-10T10:00:00-03:00",
      "data_encerramento": "2026-09-10T11:00:00-03:00",
      "duracao_min": 60.0
    }
  ],
  "chamados": [
    {
      "protocolo": "AT-DEMO-001",
      "canal": "SITE",
      "assunto": "FALTA DE ENERGIA",
      "subassunto": null,
      "data_abertura": "2026-09-10T10:05:00-03:00",
      "data_fechamento": "2026-09-10T11:05:00-03:00",
      "nota_satisfacao": null,
      "historico": []
    }
  ]
}
```

Sem registros: `[]`. UC inexistente: `404`. Sem competência disponível: `periodo_referencia: null` e listas temporais vazias.

`chamados[].historico[]`: `sequencia` (inteiro), `data` (ISO 8601), `acao` e `canal` (strings).

`energia_injetada_kwh_media_mensal` é média cadastral sem período explícito; não representa geração medida no mês nem uma série histórica.

Status/tipos das fontes permanecem strings até normalização; exemplos não definem enums.

## 6. GET /inspecoes/candidatos

**Finalidade:** fila analítica de unidades a inspecionar, separada das ordens já criadas.

```http
GET /inspecoes/candidatos?periodo_atual=2026-09&periodo_comparacao=2026-08&municipio=Recife&page=1&page_size=20
```

Resposta `200` — exemplo simulado de análise disponível:

```json
{
  "periodo_referencia": "2026-09",
  "status_analise": "disponivel",
  "motivo_indisponibilidade": null,
  "items": [
    {
      "id_uc": "UC-DEMO-001",
      "municipio": "Recife",
      "bairro": "Boa Vista",
      "classe": "Residencial",
      "alimentador": "ALM-DEMO-001",
      "posicao": 1,
      "motivos": ["Variação de consumo identificada pela análise de exemplo."],
      "energia_estimada_recuperar": {
        "valor": 120.0,
        "unidade": "kWh",
        "periodo_referencia": "2026-09"
      }
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

`posicao`: posição após filtros, antes da paginação. Ordenar por posição e ID da UC.

Sem metodologia: `status_analise: "indisponivel"`, motivo `METODOLOGIA_PENDENTE`, `items: []`, `total: 0`. Análise disponível sem candidatos: lista vazia e status `disponivel`.

Estimativa ausente: `valor: null`. Energia historicamente recuperada não é estimativa futura.

## 7. Ordens de inspeção

Ordens do portal são distintas das inspeções históricas do Excel.

### 7.1 Status e regras propostas

Status: `ABERTA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`.

Transições permitidas:

- `ABERTA` → `EM_ANDAMENTO` ou `CANCELADA`.
- `EM_ANDAMENTO` → `CONCLUIDA` ou `CANCELADA`.
- `CONCLUIDA` e `CANCELADA` são finais nesta V1.

Máximo de uma ordem ativa (`ABERTA` ou `EM_ANDAMENTO`) por UC, validado no backend/persistência.

Resultados propostos: `IRREGULARIDADE_CONFIRMADA`, `SEM_IRREGULARIDADE`, `INCONCLUSIVA`.

Status indica andamento; resultado indica a constatação da inspeção.

### 7.2 GET /inspecoes

`periodo_atual`: mês de criação. Filtros geográficos: UC vinculada. Ordenar por `criado_em` decrescente e `id` crescente.

```http
GET /inspecoes?status=ABERTA&page=1&page_size=20
```

Resposta `200`:

```json
{
  "items": [
    {
      "id": "OS-DEMO-001",
      "id_uc": "UC-DEMO-001",
      "status": "ABERTA",
      "motivo": "Verificar variação de consumo.",
      "criado_em": "2026-10-20T10:00:00-03:00",
      "atualizado_em": "2026-10-20T10:00:00-03:00",
      "motivo_cancelamento": null,
      "resultado": null
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

### 7.3 POST /inspecoes

Requisição:

```http
POST /inspecoes
Content-Type: application/json
```

```json
{
  "id_uc": "UC-DEMO-001",
  "motivo": "Verificar variação de consumo."
}
```

Obrigatórios: `id_uc` não vazio e `motivo` com 1–1000 caracteres após remover espaços nas extremidades. Servidor gera ID, datas e status inicial. UC inexistente: `404`; ordem ativa: `409`.

Resposta `201`:

```json
{
  "id": "OS-DEMO-001",
  "id_uc": "UC-DEMO-001",
  "status": "ABERTA",
  "motivo": "Verificar variação de consumo.",
  "criado_em": "2026-10-20T10:00:00-03:00",
  "atualizado_em": "2026-10-20T10:00:00-03:00",
  "motivo_cancelamento": null,
  "resultado": null
}
```

### 7.4 PATCH /inspecoes/{id}

Não permite trocar `id_uc`, ID da ordem ou data de criação. `status` é obrigatório. Para iniciar:

```http
PATCH /inspecoes/OS-DEMO-001
Content-Type: application/json
```

```json
{
  "status": "EM_ANDAMENTO"
}
```

Resposta `200`:

```json
{
  "id": "OS-DEMO-001",
  "id_uc": "UC-DEMO-001",
  "status": "EM_ANDAMENTO",
  "motivo": "Verificar variação de consumo.",
  "criado_em": "2026-10-20T10:00:00-03:00",
  "atualizado_em": "2026-10-20T11:00:00-03:00",
  "motivo_cancelamento": null,
  "resultado": null
}
```

Para concluir uma ordem em andamento:

```json
{
  "status": "CONCLUIDA",
  "resultado": {
    "data": "2026-10-20",
    "inspetor": "INSP-DEMO-001",
    "classificacao": "IRREGULARIDADE_CONFIRMADA",
    "tipo_irregularidade": "BY-PASS",
    "kwh_recuperado": 120.0,
    "observacoes": "Registro fictício para testar o formulário."
  }
}
```

Resposta `200`: objeto completo da ordem, com `status: "CONCLUIDA"`, `resultado` igual ao resultado validado e `atualizado_em` atualizado.

Para cancelar:

```json
{
  "status": "CANCELADA",
  "motivo_cancelamento": "Ordem criada em duplicidade."
}
```

Resposta `200`: objeto completo da ordem com status e motivo de cancelamento atualizados, `resultado: null`.

Regras propostas de validação:

- Conclusão exige `resultado`, com `data`, `inspetor` e `classificacao`.
- `tipo_irregularidade` obrigatório quando confirmada; nos demais casos, `null`.
- `kwh_recuperado` é número não negativo ou `null` se ainda não apurado. Não confundir recuperação com consumo do mês. Sem irregularidade, deve ser `0`; inconclusiva, `null`.
- `observacoes` é opcional/anulável, até 2000 caracteres.
- Cancelamento exige motivo não vazio, até 1000 caracteres, e não aceita resultado.
- `EM_ANDAMENTO` não aceita resultado nem motivo de cancelamento.
- Combinação de campos inválida: `422`; transição incompatível com o estado armazenado: `409`.

## 8. GET /operacao

**Finalidade:** DEC/FEC mensais por alimentador.

```http
GET /operacao?periodo_atual=2026-09&alimentador=ALM-DEMO-001&page=1&page_size=20
```

Resposta `200`:

```json
{
  "periodo_referencia": "2026-09",
  "items": [
    {
      "alimentador": "ALM-DEMO-001",
      "status_calculo": "indisponivel",
      "motivo_indisponibilidade": "METODOLOGIA_PENDENTE",
      "dec": {"valor": null, "unidade": "h/UC", "periodo_referencia": "2026-09"},
      "fec": {"valor": null, "unidade": "interrupcoes/UC", "periodo_referencia": "2026-09"}
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

Ordenar por alimentador. Cálculo disponível: `status_calculo: "disponivel"`, motivo `null`, valores numéricos.

Metodologia pendente: ver seção final. Não usar média simples de duração como DEC ou contagem de linhas como FEC.

## 9. POST /ia

**Finalidade:** pergunta do usuário com resposta textual, usando o contexto dos filtros.

**Extensão de resposta proposta; conferir requisito de IA antes de aprovar.**

`pergunta`: obrigatória, 1–2000 caracteres. `contexto`: opcional; se enviado, exige `periodo_atual` e aceita filtros mensais/geográficos, sem paginação. Sem contexto, o agente pode pedir o período.

```http
POST /ia
Content-Type: application/json
```

```json
{
  "pergunta": "Qual foi o consumo no período?",
  "contexto": {
    "periodo_atual": "2026-09",
    "periodo_comparacao": "2026-08",
    "municipio": "Recife",
    "bairro": null,
    "classe": "Residencial",
    "alimentador": null
  }
}
```

Resposta `200` — exemplo fictício:

```json
{
  "resposta": "No cenário simulado, o consumo foi de 150.000 kWh em setembro de 2026, 20% acima de agosto.",
  "contexto": {
    "periodo_atual": "2026-09",
    "periodo_comparacao": "2026-08",
    "municipio": "Recife",
    "bairro": null,
    "classe": "Residencial",
    "alimentador": null
  },
  "indicadores_utilizados": [
    {"nome": "consumo", "valor": 150000.0, "unidade": "kWh", "periodo_referencia": "2026-09"},
    {"nome": "consumo", "valor": 125000.0, "unidade": "kWh", "periodo_referencia": "2026-08"}
  ],
  "gerado_em": "2026-10-20T10:00:00-03:00"
}
```

Resposta: contexto aplicado ou `null`; indicadores usados ou `[]`. O agente não altera ordens nem expõe raciocínio interno.

## 10. POST /ia/insight

**Finalidade:** análise automática complementar no dashboard. Não substitui os indicadores e gráficos de `/dashboard`.

`contexto` obrigatório, com os mesmos filtros do dashboard, incluindo os dois períodos.

```http
POST /ia/insight
Content-Type: application/json
```

```json
{
  "contexto": {
    "periodo_atual": "2026-09",
    "periodo_comparacao": "2026-08",
    "municipio": "Recife",
    "bairro": null,
    "classe": "Residencial",
    "alimentador": null
  }
}
```

Resposta `200` — exemplo fictício:

```json
{
  "resposta": "No cenário simulado, receita faturada e consumo cresceram 20%. A decomposição entre preço e volume ainda não está disponível.",
  "contexto": {
    "periodo_atual": "2026-09",
    "periodo_comparacao": "2026-08",
    "municipio": "Recife",
    "bairro": null,
    "classe": "Residencial",
    "alimentador": null
  },
  "indicadores_utilizados": [
    {"nome": "receita_faturada", "valor": 120000.0, "unidade": "BRL", "periodo_referencia": "2026-09"},
    {"nome": "receita_faturada", "valor": 100000.0, "unidade": "BRL", "periodo_referencia": "2026-08"},
    {"nome": "consumo", "valor": 150000.0, "unidade": "kWh", "periodo_referencia": "2026-09"},
    {"nome": "consumo", "valor": 125000.0, "unidade": "kWh", "periodo_referencia": "2026-08"}
  ],
  "gerado_em": "2026-10-20T10:00:00-03:00"
}
```

Backend consulta os indicadores do recorte informado. Front refaz a consulta ao mudar filtros e descarta respostas antigas. Falha no insight não bloqueia o dashboard; fonte indisponível: `503`.

## 11. GET /health

Rota de infraestrutura já implementada, fora das dez rotas funcionais:

```http
GET /health
```

Resposta `200`:

```json
{
  "status": "ok"
}
```

Verifica a API, não banco/pipeline/agente.

## 12. Stubs e pendências

Após aprovação, Thiago implementa `schemas/` e `routers/`; Gheyson espelha os formatos em `types/` e mocks. Stubs validam entradas e devolvem exemplos fixos, sem banco ou IA. Documentar no `/docs` os cenários suportados e a ausência de persistência em POST/PATCH. Na integração real, preservar os formatos aprovados.

Os campos foram referenciados no cadastro de UCs, faturas, leituras 2022–2026, medidores, geração distribuída, ocorrências, atendimentos e inspeções enviados. Dados entrega a fonte tratada; Dev faz o mapeamento nos repositories.

| Confirmar antes da aprovação | Responsáveis |
| --- | --- |
| Períodos mensais, formatos JSON e regras das ordens (status/transições/uma ativa por UC). | Thiago, Gheyson e grupo |
| Receita: faturas elegíveis, duplicidades, base financeira e cálculo preço-volume. | Dados e Dev |
| Candidatos: critérios de suspeita, prioridade e horizonte da energia estimada. | Responsáveis pela análise |
| DEC/FEC: população por alimentador, eventos elegíveis, duplicados, sem encerramento e que atravessam meses. | Dados |
| IA: conferir seção 2, itens 1–3, ainda não fornecida; validar extensão de resposta e insight, incluindo auditoria. | Responsável pela IA e par |
| Fonte tratada: chaves, vocabulários, competências, interpretação de datas sem fuso e tecnologia da geração (não identificada explicitamente no bruto). | Dados e Dev |

**Aprovação pendente.** Registrar responsáveis e data após a revisão.
