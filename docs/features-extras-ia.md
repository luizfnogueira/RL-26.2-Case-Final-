# Features extras do módulo de IA

**V-Energy Grid 360 · Rocket Lab 2026.2**

Equipe 3 (Dados + GenAI) · contribuições de Luiz Felipe Andreto Nogueira · 30/10/2026, atualizado em 04/11/2026

> Detalhamento, com os commits, das funcionalidades de GenAI resumidas em [`FEATURES_EXTRAS.md`](FEATURES_EXTRAS.md).

## Resumo

Este documento lista o que foi entregue além do escopo do case, a partir dos 25 commits de Luiz Felipe nas branches main e feat/genai (todos já estão na main, pelo PR #14). Cada item foi comparado com os requisitos da seção 5 do case e separado em três grupos:

- **Features extras:** funcionalidades que o case não pede, nem como diferencial. São 7.
- **Diferenciais do case atendidos:** itens marcados como "(Diferencial)" na seção 5. São 3.
- **Requisitos obrigatórios entregues além do mínimo:** pedidos pelo case, mas com garantias que o texto não exige. São 4.

O case convida a isso: "Iniciativas além das listadas também são bem-vindas, desde que agreguem valor ao cliente." Todas as features extras seguem a prioridade da seção 7, de que o agente precisa ser honesto: nenhuma delas deixa o modelo escrever números, e várias existem justamente para evitar uma resposta errada.

Atualização de 04/11/2026: a seção 4 reúne os 23 commits de IA feitos depois de 30/10, com um extra novo (o guia da plataforma no assistente) e reforços de honestidade.

| Feature extra | Ganho principal | Gasta tokens? |
|---|---|---|
| 1. Gráficos na conversa | Leitura rápida de tendências e comparações | Não (backend escolhe e desenha) |
| 2. Pedido de esclarecimento | Evita somar bairros homônimos ou escolher o período errado | Não |
| 3. Resumo da conversa antiga | Conversas longas coerentes | Cerca de 20 a 40 por pergunta antiga |
| 4. Respostas pré-calculadas | Resposta instantânea e economia de cota | Não (0 na reutilização) |
| 5. Tabela no chat com CSV | Rankings legíveis e exportáveis | Não |
| 6. Aba de sugestões | Adoção por quem não sabe o que perguntar | Só ao enviar |
| 7. Log com proteção de dados | Auditoria alinhada à LGPD | Não |

## 1. Features extras (fora do escopo do case)

### 1. Gráficos gerados pelo agente na conversa

**Por que não bastava o escopo:** o case pede respostas claras em português; não pede gráficos no chat. Comparações entre períodos e séries mensais ficam difíceis de ler só em texto ou tabela.

**O que foi feito:**

- A pessoa pede "em gráfico", "em barras", "em pizza" ou "em linhas", e o assistente desenha na própria conversa. Comparações P1 × P2 e séries no tempo viram gráfico automaticamente.
- O backend escolhe o tipo pela forma dos dados, sem gastar tokens: o modelo não desenha nem escreve números, e todos os valores vêm do banco.
- Boas práticas de visualização (referência Nastengraph): barras a partir do zero, pizza só para partes de um todo (até 5 fatias com "Outros"), linhas só para tempo (até 4 séries e 48 meses).
- Quando o tipo pedido engana (pizza de DEC, de média, de valor negativo ou de períodos), o gráfico sai em barras e um aviso acima dele explica o motivo.
- Um aviso diz o que ficou fora do desenho (meses além do limite, municípios além de 4 linhas, colunas de outra unidade, meses sem dado), e "Ver como tabela" mostra a resposta inteira, com exportação em CSV.
- O gráfico usa todas as linhas da consulta (até 500), não só as 50 exibidas na tabela.

**Valor para a V-Energy:** o diretor vê a tendência e a comparação na hora, sem montar planilha, e com a garantia de que o gráfico não distorce os dados.

**Commits:** 0befa61, 8557e19, a2afa62, ce71349, b2160ed, 4e03350

### 2. Pedido de esclarecimento para perguntas ambíguas

**Por que não bastava o escopo:** algumas perguntas têm mais de uma resposta certa. Na Gold, o bairro "Centro" existe em 10 municípios, e "este ano" pode ser 2026 (só janeiro a junho) ou o P2. Sem perguntar, o agente somava os 10 Centros ou escolhia um período sozinho.

**O que foi feito:**

- Antes de chamar o modelo, o backend detecta a ambiguidade e responde com botões de opção: um por município, mais "Todos os municípios juntos", ou "2026 (jan a jun)" e "P2".
- Cada botão reenvia a pergunta já completa na mesma conversa.
- O município da pergunta anterior só é usado numa continuação clara ("E no Centro?").
- Novo status "esclarecer" no contrato da API, gravado no log de auditoria.

**Valor para a V-Energy:** evita um número errado apresentado com confiança, que é o risco que a Diretora de Tecnologia mais teme ("dados inventados são mais prejudiciais do que não ter"), e não gasta tokens.

**Commits:** dad37e9, 6041b30, 163c4e5

### 3. Resumo das perguntas antigas da conversa

**Por que não bastava o escopo:** o follow-up (diferencial do case) usa as 3 últimas trocas. Numa conversa longa, perguntas como "e o primeiro município que eu perguntei?" ficavam sem contexto.

**O que foi feito:**

- Com mais de 3 trocas, o agente recebe também uma lista curta das 10 perguntas anteriores, montada pelo backend a partir do log, sem chamar o modelo.
- Custo baixo: cerca de 20 a 40 tokens por pergunta antiga.
- Quando a conversa passa até desse limite, o agente responde que não lembra e pede para repetir, em vez de chutar. Depois de 2 horas sem interação, a conversa recomeça com o contexto limpo, para um filtro antigo não contaminar uma pergunta nova.

**Valor para a V-Energy:** conversas longas continuam coerentes, sem aumentar muito o custo por pergunta e sem respostas inventadas sobre o começo da conversa.

**Commits:** c016a46, ece6cb9

### 4. Respostas pré-calculadas (cache que se enche com o uso)

**Por que não bastava o escopo:** o modelo recomendado roda num plano gratuito, com limite de requisições, e perguntas repetidas gastavam tokens e tempo à toa.

**O que foi feito:**

- Uma resposta correta fica guardada no banco (tabela ia.resposta_cache) e é reaproveitada para a mesma pergunta ou uma parecida, com 0 tokens.
- "Parecida" exige texto 90% semelhante e a mesma "assinatura": municípios, bairros, classes, números, P1/P2, meses e qualificadores. "Receita em Jaboatão" nunca reaproveita "Receita em Olinda".
- O cache é por versão da Gold: recarregar os dados o esvazia. Guarda até 500 respostas e pode ser desligado por configuração.

**Valor para a V-Energy:** respostas instantâneas para as perguntas frequentes da diretoria e economia de cota do modelo, sem risco de devolver o número de outro município.

**Commits:** ab16fda

### 5. Resposta em tabela dentro do chat, com ordenação e CSV

**Por que não bastava o escopo:** rankings e listas ("os 5 alimentadores com maior DEC") ficam ilegíveis em texto corrido.

**O que foi feito:**

- Respostas com várias linhas aparecem como tabela no corpo da conversa, com ordenação por coluna, paginação de 10 em 10, unidades (R$, kWh, %) e botão "Exportar CSV".

**Valor para a V-Energy:** o analista leva o resultado direto para a planilha ou o e-mail, sem copiar à mão.

**Commits:** aa94b30 (GENAI-15)

### 6. Aba de sugestões de perguntas

**Por que não bastava o escopo:** o usuário não técnico não sabe o que pode perguntar.

**O que foi feito:**

- 16 perguntas prontas em 6 categorias, incluindo as três perguntas citadas no case pela diretoria. A sexta categoria, "Como usar a plataforma", leva ao guia do portal. Um clique envia a pergunta, e um teste garante que toda sugestão está no golden set.

**Valor para a V-Energy:** diminui a curva de adoção e mostra o alcance do assistente na primeira visita.

**Commits:** aa94b30 (GENAI-16)

### 7. Log de auditoria com proteção de dados pessoais

**Por que não bastava o escopo:** o case pede auditoria das respostas, mas não trata de privacidade nem de retenção do histórico.

**O que foi feito:**

- Cada troca fica registrada (pergunta, SQL, tabelas, tokens, tempo e modelo) na tabela ia.interacao.
- CPF, CNPJ e e-mail digitados na pergunta são mascarados antes de gravar.
- Registros com mais de 30 dias são apagados automaticamente quando a API sobe em modo real.

**Valor para a V-Energy:** rastreabilidade para auditoria alinhada a boas práticas de LGPD.

**Commits:** d5a5505

## 2. Diferenciais do case atendidos

Itens que o case marca como "(Diferencial)", não obrigatórios, para os quais estas contribuições entregaram a funcionalidade ou parte dela:

| Diferencial (seção do case) | Como foi atendido | Commits |
|---|---|---|
| Follow-up sem repetir o contexto (5.3) | Memória da conversa no servidor: o front reenvia só o conversa_id e o agente recebe as últimas 3 trocas, herdando município, classe e período. | 3cfe0a8, d5a5505, 7f785c9 |
| Testes automatizados no backend (5.2) | Testes para cada entrega: contrato, ponte, memória, gráficos, esclarecimento, cache e regras de negócio, com modelo simulado (sem gastar tokens) e banco PostgreSQL de teste. | em todos os commits de feature e correção |
| Medir a qualidade do agente (5.3) | Bloco de qualidade no painel de detalhes técnicos, que mostra o último run da avaliação. O golden set e o script de avaliação ficaram com o Vinicius. | aa94b30 (GENAI-19) |

## 3. Requisitos obrigatórios entregues além do mínimo

Não são extras, porque o case os pede, mas foram entregues com garantias que o texto não exige:

| Requisito | O que foi além | Commits |
|---|---|---|
| Agente honesto (seção 7) | Validações determinísticas antes de mostrar a resposta: conferência de que todo número do texto veio do banco; DEC/FEC de um período pela soma dos meses, nunca pela média; DEC de um município ponderado pelas UCs (antes somava os alimentadores); P1 e P2 sempre com os meses do contrato. A consulta errada é barrada e o agente refaz. | 621ce25, 6bf563b, 7ed3eaa, 80d4418 |
| Auditar como a IA chegou à resposta (5.3) | Além do SQL ("Como cheguei nisso"), o painel de detalhes técnicos mostra o plano, as ferramentas chamadas, os tokens e o tempo por etapa, e separa o que foi registrado do que o modelo declarou. | aa94b30 (GENAI-18) |
| Insight gerado por IA (5.3) | O texto do insight da receita usa marcadores preenchidos pelo código com os números da Gold; número inventado faz o modelo tentar de novo e, se repetir, entra um texto por regra. | addbc08 |
| Agente dentro da plataforma (5.3) | Prazo de resposta configurável e mensagem amigável quando o provedor do modelo cai, em vez de erro técnico na tela. | 7f785c9, bc51e87 |

## 4. Atualizações depois de 30/10

Commits de IA de Luiz Felipe entre 30/10 e 04/11, todos já na main.

### 4.1 Guia da plataforma dentro do assistente (feature extra nova)

- O assistente explica telas, filtros e limites do portal a partir de um guia público escrito pela equipe.
- Um roteador de intenção manda essas perguntas ao guia, e não ao agente de dados: uma dúvida de uso nunca vira SQL.
- "Como cheguei nisso" mostra as seções do guia usadas na resposta, e o contrato da API registra a fonte.

**Commits:** 57b1f15, fd5a692, 4e0f721, d305e38, e6f5735, ab43c32

### 4.2 Esclarecimento ampliado para períodos

- "Último ano" e "ano passado" pedem esclarecimento entre 2025 (jan a dez) e os últimos 12 meses (P2).
- Respostas sobre 2026 avisam que a base só vai até junho.

**Commits:** 1683d76, 29eda73

### 4.3 O "porquê" da receita

- Na pergunta do Henrique, o agente traz a ponte da receita (receita P1, efeito-preço, efeito-volume, receita P2), o efeito-preço em %, a variação do volume e os meses fora da bandeira verde em cada período.
- Explica que o preço passa do reajuste citado por causa das bandeiras tarifárias, sem chamar o efeito-preço inteiro de reajuste.
- A decomposição preço × volume vale para qualquer par de períodos.
- O gráfico de ponte usa só a receita de energia (sem tributos) e só é desenhado quando as barras fecham com o resultado.
- Valores grandes aparecem compactos (R$ 43,8 mi) e perdas não repetem o sinal ("caiu 2,09%", não "caiu −2,09%").

**Commits:** fcaa83b, 43d4c1f, dc6ccb8, f2f33e4

### 4.4 Recorte honesto nas respostas (reforço da honestidade)

- Uma consulta sem filtro de data é descrita como "toda a base (jul/2022 a jun/2026)", nunca como "P2"; o código corrige o rótulo do período sem gastar outra chamada.
- Uma regra barra filtros de data e hora que perdem o último dia do período (por exemplo, BETWEEN ... AND '2026-06-30' numa coluna com hora), e o agente refaz a consulta.
- Diferenças mínimas são ditas como "praticamente iguais", e todo percentual vem junto do valor absoluto.

**Commits:** 1319561, c05c879

### 4.5 Regras de negócio corrigidas

- "Call center" conta todos os canais de atendimento, como no case; "ligação" e "telefone" filtram só o telefone.
- DEC e FEC por município exigem a fórmula ponderada pelas UCs atendidas.
- Contar interrupções exige tirar oscilações e ocorrências anteriores à ligação da UC.

**Commits:** 6ba19ab, 880f1ea, d1b23fc

### 4.6 Qualidade e experiência de uso

- Golden set com mais 3 casos em que o agente tem de dizer que não sabe.
- Conversa vazia com 2 sugestões sorteadas; erro do assistente sem código técnico na mensagem.
- Gráficos: P1 e P2 com cores diferentes também no tema escuro, e o rótulo de barra negativa não cobre o nome da categoria.

**Commits:** eefd054, 90d4d43, ba88117, 930d4b6, 6d945ba, 3d4891b

## Anexo: classificação de cada commit

| Commit | Data | Assunto | Classificação |
|---|---|---|---|
| 624d332 | 23/10 | Pente fino da camada Gold | Obrigatório |
| 3cfe0a8 | 28/10 | Contrato do POST /ia com conversa_id, apresentação e detalhes técnicos | Diferencial (follow-up) |
| d5a5505 | 28/10 | Tabela ia.interacao, conversa_id e log de auditoria | Diferencial + extra 7 |
| 7f785c9 | 28/10 | Agente real na ponte do POST /ia, com memória e prazo | Obrigatório + diferencial |
| addbc08 | 28/10 | Insight da receita gerado com PydanticAI e marcadores | Obrigatório |
| aa94b30 | 28/10 | Tela 7: tabela, sugestões e detalhes técnicos | Extras 5 e 6 + obrigatório |
| 65ff587 | 28/10 | Documentação do módulo de IA | Obrigatório |
| 621ce25 | 28/10 | Conferência de números do agente | Reforço (honestidade) |
| 6bf563b | 28/10 | DEC/FEC pela soma dos meses | Reforço (honestidade) |
| 7ed3eaa | 28/10 | P1 e P2 com os meses do contrato | Reforço (honestidade) |
| ece6cb9 | 28/10 | Não chuta o começo da conversa | Extra 3 |
| fa40e3f | 28/10 | Página não desce a cada pergunta | Correção |
| 0befa61 | 29/10 | Gráficos de barras, pizza e linhas | Extra 1 |
| dad37e9 | 29/10 | Pedido de esclarecimento | Extra 2 |
| c016a46 | 29/10 | Resumo da conversa antiga | Extra 3 |
| ab16fda | 29/10 | Respostas pré-calculadas | Extra 4 |
| 6041b30 | 29/10 | Esclarecimento: qualquer município resolve; 10 opções do Centro | Extra 2 |
| 163c4e5 | 29/10 | Esclarecimento: troca anterior só em "E no Centro?" | Extra 2 |
| 8557e19 | 29/10 | Gráfico com todas as linhas e tabela completa | Extra 1 |
| a2afa62 | 29/10 | Gráfico avisa o que ficou de fora | Extra 1 |
| ce71349 | 29/10 | Pizza recusada explica o motivo; título limpo | Extra 1 |
| b2160ed | 29/10 | Barras com valor negativo e rótulos sem sobreposição | Extra 1 |
| 4e03350 | 29/10 | Agente não acrescenta métrica nem agrupamento ao gráfico | Extra 1 |
| 80d4418 | 29/10 | DEC de município ponderado pelas UCs | Reforço (honestidade) |
| bc51e87 | 30/10 | Ponte da IA volta a gravar log e cache | Correção |

Fora deste levantamento: commits de outros membros do time (Théo, Vinicius e equipe de Dev), incluindo o golden set, as entidades e os guardrails do Vinicius.
