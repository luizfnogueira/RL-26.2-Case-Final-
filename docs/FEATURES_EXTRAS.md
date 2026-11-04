# Funcionalidades extras

**V-Energy Grid 360 · Rocket Lab 2026.2**

Tudo o que o time entregou além dos requisitos obrigatórios do case: o que cada funcionalidade faz e por que foi criada. As decisões por trás de cada uma estão em [`decisoes.md`](decisoes.md).

| Frente | Funcionalidade |
|---|---|
| Dados | [Pipeline paralelo pelas dependências reais](#pipeline-paralelo-pelas-dependências-reais) |
| Dados | [Testes de qualidade no pipeline](#testes-de-qualidade-no-pipeline) |
| Dev | [Autenticação JWT com código de convite e gestão de perfil](#autenticação-jwt-com-código-de-convite-e-gestão-de-perfil) |
| Dev | [Testes automatizados no back-end e no front-end](#testes-automatizados-no-back-end-e-no-front-end) |
| Dev | [Comparador lado a lado no Painel Executivo](#comparador-lado-a-lado-no-painel-executivo) |
| Dev | [Seletor "Ver por: Região \| Classes" e Top 5 perdas na Tela 2](#seletor-ver-por-região--classes-e-top-5-perdas-na-tela-2) |
| Dev | [Pós-processamento determinístico e fallback no insight](#pós-processamento-determinístico-e-fallback-no-insight) |
| Dev | [Filtros na URL e gráficos SVG nativos](#filtros-na-url-e-gráficos-svg-nativos) |
| Dev | [Trava de concorrência para ordens de inspeção](#trava-de-concorrência-para-ordens-de-inspeção) |
| Dev | [Importador da Gold com manifesto e verificador](#importador-da-gold-com-manifesto-e-verificador) |
| Dev | [Resumos por IA na Receita e na Visão 360](#resumos-por-ia-na-receita-e-na-visão-360) |
| GenAI | [Gráficos na conversa](#gráficos-na-conversa) |
| GenAI | [Pedido de esclarecimento](#pedido-de-esclarecimento) |
| GenAI | [Resumo da conversa antiga](#resumo-da-conversa-antiga) |
| GenAI | [Respostas pré-calculadas](#respostas-pré-calculadas) |
| GenAI | [Tabela no chat com CSV](#tabela-no-chat-com-csv) |
| GenAI | [Aba de sugestões](#aba-de-sugestões) |
| GenAI | [Log com proteção de dados](#log-com-proteção-de-dados) |
| GenAI | [Assistência para dúvidas sobre a plataforma](#assistência-para-dúvidas-sobre-a-plataforma) |

---

## Engenharia de Dados

### Pipeline paralelo pelas dependências reais

**O que faz:** o Job do Databricks roda cada tabela assim que as tabelas de que ela depende terminam, e não camada por camada. As quatro Silver rodam juntas depois do cadastro, a fila de perdas segue num ramo próprio e as Gold de DEC/FEC, KPIs, receita e Visão 360 rodam em paralelo depois da `gold_base`.

**Por que:** na forma mais comum do medalhão, tudo roda em sequência. Com o desenho paralelo, o Job levou **18 min 14 s** contra cerca de **34 min** em sequência, aproximadamente **1,9 vez mais rápido**. A mesma regra (uma Silver nunca lê outra Silver) deixou cinco pessoas desenvolverem suas tabelas ao mesmo tempo.

### Testes de qualidade no pipeline

**O que faz:** cada notebook da Silver e da Gold confere unicidade, nulos, domínios e a reconciliação das contagens **antes de gravar**, e para se uma garantia falhar. Toda execução grava um log com a contagem de cada problema. Na exportação, um manifesto registra linhas, colunas e hash SHA-256 de cada CSV.

**Por que:** dado errado não pode chegar em silêncio ao portal. Se uma regra quebra, o pipeline para em vez de gravar, e o log responde quantos registros cada regra afetou.

---

## Desenvolvimento

### Autenticação JWT com código de convite e gestão de perfil

**O que faz:** cadastro só com código de convite, login com token JWT válido por 60 minutos e senhas guardadas com hash Argon2id. Todas as rotas de negócio exigem login.

**Por que:** o portal mostra dados internos da distribuidora, então só quem foi convidado entra. O código de convite e as chaves ficam apenas no `.env`, nunca no código ou no repositório.

### Testes automatizados no back-end e no front-end

**O que faz:** no back-end, pytest num banco só de teste, cobrindo o contrato das rotas, a fila e as ordens, a receita, a autenticação, a carga da Gold e o assistente. No front-end, Vitest e Testing Library para componentes, hooks e telas, além de typecheck, lint, Prettier e build. Os mocks do front são conferidos contra os schemas da API.

**Por que:** com várias pessoas mexendo ao mesmo tempo, os testes avisam na hora quando uma mudança quebra outra parte. Se o formato de uma rota muda sem o front acompanhar, o teste falha.

### Comparador lado a lado no Painel Executivo

**O que faz:** compara de 2 a 4 municípios, bairros ou classes pelos mesmos indicadores do painel, normalizados por UC.

**Por que:** a liderança quer saber onde o problema está. Normalizar por UC permite comparar uma cidade grande com uma pequena sem que o tamanho distorça a leitura.

### Seletor "Ver por: Região | Classes" e Top 5 perdas na Tela 2

**O que faz:** o ranking do Diagnóstico da Receita alterna entre a visão por região e por classe de consumo, e destaca em barras as cinco maiores perdas por volume. O ranking é ordenado pela perda por volume, com a perda por preço ao lado.

**Por que:** a pergunta da tela é "onde o volume caiu?". A resposta pode estar num lugar ou num tipo de cliente, e o seletor mostra os dois cortes sem sair da tela.

### Pós-processamento determinístico e fallback no insight

**O que faz:** os números da "Análise da IA" (Receita) e do resumo da Visão 360 são calculados pelo back-end. O modelo só escreve o texto em volta, e o código corrige sinais duplicados, unidades e escala. Se o modelo falhar, a tela mostra um texto calculado por regra sobre os mesmos números, com o selo **"Texto alternativo"**.

**Por que:** uma instabilidade do provedor de IA nunca quebra a tela, e o texto nunca traz um número diferente do gráfico.

### Filtros na URL e gráficos SVG nativos

**O que faz:** o hook `useFiltrosUrl` guarda os filtros na URL, então copiar o link abre exatamente o mesmo recorte para outra pessoa. A cascata da receita e as barras foram desenhadas em SVG próprio, sem biblioteca externa, com dica ao passar o mouse e uma versão em tabela para leitores de tela.

**Por que:** compartilhar um recorte é o jeito natural de uma liderança mostrar um achado para outra. Os gráficos próprios dão controle total do visual e da acessibilidade.

### Trava de concorrência para ordens de inspeção

**O que faz:** um índice único no banco garante que cada UC tenha no máximo uma ordem ativa (aberta ou em campo); se alguém tentar criar outra, a API responde 409. Ordens em lote são criadas no modo tudo-ou-nada.

**Por que:** um clique duplo ou dois analistas na mesma fila não podem mandar duas equipes ao mesmo endereço. A trava no banco funciona mesmo com pedidos simultâneos, e o lote nunca fica pela metade.

### Importador da Gold com manifesto e verificador

**O que faz:** o importador carrega os CSVs da Gold no PostgreSQL numa única transação, conferindo linhas e colunas contra o manifesto da Engenharia de Dados. Depois, um verificador confere chaves, tipos numéricos exatos e a máscara de CPF e CNPJ. Ao final, cria o índice do valor em aberto e roda `VACUUM ANALYZE`.

**Por que:** se algo não bate, nada é gravado, e o portal nunca fica com uma carga pela metade ou com dados pessoais sem máscara.

### Resumos por IA na Receita e na Visão 360

**O que faz:** duas telas trazem um texto de análise escrito por IA (`POST /ia/insight`).

- **Diagnóstico da Receita:** o card "Análise da IA" explica a ponte da receita, ou seja, quanto da variação veio de preço (reajuste e bandeiras) e quanto veio de volume.
- **Visão 360:** o botão **"Gerar resumo"** produz, sob demanda, um resumo da unidade para o atendente. Ele diz se a conta está alta, normal ou baixa e por quê, olhando o consumo e o valor da fatura em relação ao mesmo mês do ano anterior.

Nos dois casos, os números saem do back-end, os mesmos que a tela já mostra. A IA só escreve o texto em volta deles.

**Por que:** o case pede insights automáticos em pelo menos uma tela, e entregamos em duas. Na Visão 360, o atendente lê a situação da UC em uma frase durante a ligação ("a conta veio alta"), sem precisar interpretar gráfico e tabelas. O resumo é gerado só quando alguém pede, para não gastar tokens a cada abertura de tela. Como a IA não escreve números, o texto nunca contradiz a tela, e se o modelo cair entra o texto por regra (ver [Pós-processamento determinístico e fallback no insight](#pós-processamento-determinístico-e-fallback-no-insight)).

---

## GenAI

### Gráficos na conversa

**O que faz:** o assistente responde com barras, pizza ou linhas, escolhidos pelo código pela forma dos dados. A ponte da receita aparece como P1, efeito-preço, efeito-volume e P2, e o gráfico avisa o que ficou de fora.

**Por que:** os valores do gráfico são as próprias células da consulta. O modelo não desenha nem escreve números, então o gráfico é tão confiável quanto a tabela.

### Pedido de esclarecimento

**O que faz:** uma pergunta ambígua volta com opções clicáveis, como "Recife ou Jaboatão?" (bairro que existe em vários municípios) ou "2025 ou os últimos 12 meses?" ("último ano", "este ano").

**Por que:** o agente não chuta. Escolher o recorte sozinho seria inventar a pergunta; com um clique, a pessoa escolhe.

### Resumo da conversa antiga

**O que faz:** o agente recebe as 3 últimas trocas da conversa e uma lista curta com as perguntas anteriores, montada pelo código, sem chamar o modelo. "E só comercial?" herda o período e a métrica da pergunta anterior. Depois de 2 horas sem interação, a conversa recomeça com o contexto limpo.

**Por que:** memória longa sem gastar tokens para resumir. O histórico fica no servidor, então ninguém consegue forjar uma conversa anterior.

### Respostas pré-calculadas

**O que faz:** pergunta igual ou muito parecida, com os mesmos nomes e números, sai do cache, guardado por versão da Gold.

**Por que:** resposta instantânea, sem tokens, e sempre coerente com a carga atual dos dados. Quando a Gold muda, o cache antigo deixa de valer.

### Tabela no chat com CSV

**O que faz:** quando o resultado tem forma de tabela, o assistente mostra uma tabela na conversa, e tabelas e gráficos podem ser baixados em CSV.

**Por que:** o analista pode conferir os números linha a linha e levar o resultado para a planilha dele sem copiar à mão.

### Aba de sugestões

**O que faz:** uma aba com perguntas sugeridas por área, incluindo as três perguntas do case. Quando a conversa está vazia, duas sugestões são sorteadas.

**Por que:** ajuda quem não sabe por onde começar. Um teste garante que toda sugestão está no golden set, então nenhuma sugestão leva a uma resposta errada.

### Log com proteção de dados

**O que faz:** toda pergunta, inclusive as bloqueadas e as sem resposta, fica no log de auditoria do schema `ia`, com SQL, status, tokens e latência. CPF, CNPJ e e-mails digitados são mascarados antes de gravar, e conversas com mais de 30 dias são apagadas quando a API sobe em modo real.

**Por que:** o time consegue auditar o que o agente respondeu e ver as tentativas bloqueadas, sem que o próprio log vire um vazamento de dados pessoais.

### Assistência para dúvidas sobre a plataforma

**O que faz:** o assistente explica as telas, os filtros e os limites do portal a partir de um guia escrito pela equipe, citando as seções usadas. O roteador de intenção identifica essas perguntas e as manda para o guia, e não para o agente de dados.

**Por que:** o usuário aprende a usar o portal na mesma conversa, e uma dúvida de uso nunca vira uma tentativa de responder com SQL.
