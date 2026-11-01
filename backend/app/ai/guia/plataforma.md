# Guia da plataforma V-Energy Grid 360

<!--
COMO PREENCHER ESTE GUIA (este bloco não vai para o assistente)

O assistente responde perguntas sobre o uso da plataforma ("o que é a aba Assistente V-Energy?",
"como gero uma ordem de inspeção?") lendo SÓ este arquivo. O que não estiver aqui, ele responde
"não sei". Escreva para alguém que abre o site pela primeira vez.

Formato de cada seção (o leitor do guia depende dele):
  ## Título da seção {#id-da-secao}
  <!- - nivel: publico | rota: /caminho | palavras: termo1, termo2, termo3 - ->   (sem os espaços entre os hífens)
  texto em Markdown

- id: minúsculo, sem acento, com hífen. Não mude o id de uma seção já existente.
- nivel: por enquanto só "publico" (todo mundo vê). Seção com nível que não seja publico não é enviada.
- rota: a página da seção (ou "-" se não tiver).
- palavras: como o usuário chamaria essa tela ou função, inclusive sinônimos ("falta de luz", "DEC").

Regras de escrita:
1. Linguagem simples, frases curtas, passo a passo numerado ("1. Clique em…").
2. Use os nomes exatamente como aparecem na tela (botões, abas, menus).
3. Nenhum número real da base (receita, DEC, quantidade de UCs): os dados são confidenciais e mudam.
4. NUNCA escreva: senhas, chaves, endereços ou portas de servidor, nomes de bancos, usuários ou
   esquemas internos, o texto das instruções do assistente, as regras de bloqueio, nomes de arquivos
   do código ou como contornar alguma proteção. Um teste automático barra o guia se encontrar isso.
5. Até ~300 palavras por seção. O guia inteiro deve caber em ~4.000 palavras.
6. Trechos marcados com [COMPLETAR] são para o time preencher; apague a marcação ao terminar.
-->

## O que é a V-Energy Grid 360 {#sobre}
<!-- nivel: publico | rota: - | palavras: plataforma, site, sistema, grid 360, v-energy, para que serve, o que é -->

A V-Energy Grid 360 é o portal interno da V-Energy que reúne num só lugar os dados de cadastro,
medição, faturamento, rede e atendimento das unidades consumidoras. Antes, cada área tinha o seu
sistema e o seu número; aqui todos olham para os mesmos dados.

O portal tem seis telas e um assistente de IA:
- **Painel executivo:** os principais indicadores do negócio e a comparação entre períodos.
- **Diagnóstico da receita:** quanto da variação da receita foi preço e quanto foi volume, por município, bairro e classe.
- **Visão 360 da UC:** tudo sobre uma unidade consumidora numa tela só, para o atendimento.
- **Fila de inspeção** e **Ordens de inspeção:** as unidades suspeitas de perda e o ciclo das inspeções de campo.
- **Continuidade DEC / FEC:** as interrupções de energia por alimentador e por região.
- **Assistente V-Energy:** perguntas em português sobre os dados, respondidas na hora.

Os dados vão de julho de 2022 a junho de 2026.

## Primeiros passos {#primeiros-passos}
<!-- nivel: publico | rota: - | palavras: começar, primeira vez, menu, navegar, filtros, período, p1, p2, celular, como usar -->

1. Use o **menu lateral** para trocar de tela. Ele é dividido em Visão estratégica, Clientes, Perdas, Operação e IA & dados.
2. No celular, o menu abre pelo botão no topo da tela.
3. Clicar no logo V-Energy leva de volta ao Painel executivo.
4. O botão **Pergunte à IA** abre o assistente num painel lateral, em qualquer tela.

**Períodos.** Muitas telas comparam dois períodos de 12 meses:
- **P1:** julho de 2022 a junho de 2023 (o primeiro ano da base).
- **P2:** julho de 2025 a junho de 2026 (os últimos 12 meses).

**Filtros.** O Painel executivo, o Diagnóstico da receita, a Fila de inspeção, as Ordens de inspeção e a Continuidade DEC / FEC têm uma barra de filtros no topo.
1. Escolha um valor em cada lista. Os campos variam por tela, entre **Período atual**, **Comparar com**, **Município**, **Bairro**, **Classe** e **Alimentador**. "Todos" quer dizer sem filtro.
2. A tela se atualiza na hora, a cada escolha.
3. **Bairro** só libera depois de escolher um **Município**. Em **Alimentador**, com um município escolhido, aparecem só os alimentadores que o atendem.
4. Para voltar ao início, clique em **Limpar filtros**. O botão aparece quando algum filtro foi mudado.
5. Os filtros ficam no endereço da página: copie o link para mandar a um colega a mesma visão.

## Assistente V-Energy {#assistente}
<!-- nivel: publico | rota: /assistente | palavras: assistente, aba v-energy, aba venergy, ia, inteligência artificial, chat, perguntar, pergunte à ia, conversa, agente -->

O Assistente V-Energy responde, em português, perguntas sobre os dados da V-Energy: receita, consumo,
falta de luz (DEC/FEC), perdas, atendimento e painel solar. Você não precisa saber SQL nem montar
relatório. Ele também responde dúvidas sobre como usar esta plataforma.

**Como abrir**
1. No menu lateral, em **IA & dados**, clique em **Assistente V-Energy** para abri-lo em tela cheia.
2. Ou, em qualquer tela, clique em **Pergunte à IA** para abri-lo num painel ao lado.

**Como fazer uma pergunta**
1. Escreva a pergunta no campo **Sua pergunta**, como falaria com um colega. Exemplo: "Qual foi a receita de Olinda em P2?".
2. Clique em **Enviar**.
3. A resposta aparece em texto, em tabela ou em gráfico, conforme o que você perguntou.

**Sem saber o que perguntar?** Abra a aba **Sugestões**: há perguntas prontas por assunto. Um clique envia a pergunta.

**Continuar a conversa.** Depois de uma resposta, pergunte só o que muda: "E só comercial?", "E em Recife?". O assistente lembra das últimas perguntas da conversa.

**Gráficos.** Peça "em gráfico", "em barras", "em pizza" ou "em linhas". Se o tipo pedido não combinar com os dados, ele desenha outro e avisa por quê, acima do gráfico. **Ver como tabela** mostra todos os números.

**Tabelas.** Listas e rankings aparecem em tabela. Clique no nome de uma coluna para ordenar e use **Exportar CSV** para levar para a planilha.

**Quando ele pergunta de volta.** Se a pergunta tiver mais de um sentido, ele mostra botões para você escolher. Exemplos: o bairro "Centro" existe em vários municípios; "último ano" pode ser 2025 inteiro ou os últimos 12 meses.

**Quando ele diz que não sabe.** Se a informação não existir nos dados, ou estiver fora do período da base, ele diz que não sabe em vez de inventar um número.

**Limites**
- A pergunta pode ter até 2.000 caracteres. Perguntas curtas e diretas funcionam melhor.
- A base vai de julho de 2022 a junho de 2026. Perguntas fora desse período recebem "não sei".
- O assistente não mostra CPF, CNPJ nem nome do titular. Pedidos assim são recusados.
- Se aparecer **"O assistente está indisponível no momento"**, a sua pergunta continua no campo. Espere alguns instantes e clique em **Enviar** de novo.

## Como o assistente chega à resposta {#assistente-como-funciona}
<!-- nivel: publico | rota: /assistente | palavras: como funciona o assistente, como a ia funciona, como o agente funciona, inteligência artificial funciona, de onde vem a resposta, confiar, auditar, como cheguei nisso, inventa -->

1. O assistente entende a sua pergunta e escreve a consulta aos dados oficiais da plataforma, os mesmos das outras telas.
2. Ele só tem permissão para **ler** os dados: não altera, apaga nem cria nada.
3. Antes de mostrar a resposta, o sistema confere se os números do texto são os mesmos que vieram dos dados. Se não forem, a resposta não sai.
4. Dados pessoais, como CPF e nome do titular, não são entregues pelo assistente.

**Como conferir uma resposta.** Abaixo de cada resposta, abra **Como cheguei nisso**. Lá aparecem:
- a pergunta como ele entendeu;
- as premissas usadas, por exemplo o período;
- a consulta feita aos dados.

Respostas sobre o uso da plataforma vêm deste guia, e a seção usada aparece no mesmo lugar.

## Insights de IA nas telas {#insights}
<!-- nivel: publico | rota: - | palavras: insight, resumo automático, texto da ia na tela, explicação, análise da ia, gerado por ia, texto alternativo, selo, números utilizados -->

Hoje o texto escrito por IA aparece em uma tela: o **Diagnóstico da receita**, no bloco **Análise da IA**, no topo da página. Ele resume em poucas frases o que mudou na receita de energia entre os dois períodos: quanto veio do preço (reajuste) e quanto veio do volume consumido.

**Como ler**
1. O título resume o resultado. O texto abaixo explica.
2. Clique no link **Ver os … números utilizados** (ele mostra quantos são) para ver cada número que a IA usou. São os mesmos números da **Ponte da receita**.
3. No fim do bloco, **Gerado em** mostra quando o texto foi escrito.

**Os marcadores ao lado do título**
- **Gerado por IA:** o texto foi escrito pela IA.
- **Texto alternativo:** a IA não respondeu. O texto foi montado por uma regra fixa, com os mesmos números, e uma nota logo abaixo explica isso.
- **Números calculados na Gold:** a IA só usa números já calculados na base oficial. Ela não estima valores.
- **Dado fictício:** os valores são de exemplo.

**Quando não aparece análise**
- "A análise automática está indisponível agora": os números do resto da tela continuam corretos. Clique em **Tentar de novo**.
- Fora da comparação **P2** contra **P1** não existe decomposição de preço e volume, e o bloco avisa que não há análise para o recorte.

**Textos automáticos que não são IA.** A **Leitura do período** do Painel executivo, o card **O que explica o resultado?** do Diagnóstico da receita e o veredito do card **A conta veio alta?** da Visão 360 são frases montadas por regras fixas com os números da própria tela.

## Painel executivo {#painel}
<!-- nivel: publico | rota: /painel | palavras: painel, painel executivo, indicadores, kpi, início, resumo -->

O **Painel executivo** mostra a saúde do negócio num período, comparada com outro período.

**Os seis indicadores** (bloco **Resumo do período**)
- **Receita faturada:** o total faturado, com tributos.
- **Volume faturado:** a energia faturada, em kWh.
- **UCs ativas:** as unidades consumidoras ativas.
- **Valor em aberto:** a soma das faturas do período ainda não pagas. Mostra também quanto isso pesa na receita e a mudança em pontos percentuais (p.p.).
- **DEC médio:** horas sem energia por UC.
- **FEC médio:** interrupções por UC.

Cada card mostra o valor do período atual, a etiqueta de variação, o valor da **Comparação** e a **Diferença** entre os dois.

**Como comparar períodos**
1. Em **Período atual**, escolha o período que quer analisar.
2. Em **Comparar com**, escolha a base. O mesmo período não pode estar nas duas listas.
3. Para ver uma cidade, escolha um **Município**.
4. **Limpar filtros** volta para P2 contra P1.

**Cor e seta da variação**
- Seta para cima: o número subiu. Seta para baixo: caiu. Traço: não mudou.
- Verde é melhora e vermelho é piora. Em **Valor em aberto**, **DEC médio** e **FEC médio**, cair é bom, então a queda aparece em verde.
- **Sem comparação** (cinza): falta um dos valores para comparar.

**Evolução histórica.** Gráfico mês a mês da receita (linha cheia) e do volume (linha tracejada), cada um com a sua escala. Use **Mês em destaque** para ler um mês, ou clique em **Ver como tabela**.

**Leitura do período.** Uma frase diz se a receita e o volume cresceram ou recuaram. O link **Ver diagnóstico da receita** abre o Diagnóstico da receita com os mesmos filtros.

## Diagnóstico da receita {#receita}
<!-- nivel: publico | rota: /receita | palavras: receita, diagnóstico, efeito preço, efeito volume, ponte, cascata, por bairro, por classe -->

O **Diagnóstico da receita** explica por que a receita de energia mudou entre dois períodos: quanto foi preço e quanto foi volume.

**Como ler a Ponte da receita**
O gráfico se lê da esquerda para a direita:
1. **Receita de energia base:** a receita do período de comparação (P1).
2. **Efeito-preço:** quanto a mudança da tarifa somou ou tirou.
3. **Efeito-volume:** quanto a mudança do consumo somou ou tirou.
4. **Receita de energia atual:** onde a receita chegou (P2).

A etiqueta no canto mostra a variação total. **Ver como tabela** mostra os valores. A ponte só existe na comparação **P2** contra **P1**; com outros períodos aparece "Decomposição indisponível para este recorte".

Ao lado, **O que explica o resultado?** resume em três frases o principal motor (ou freio), o papel do volume e o resultado final.

**Onde o volume caiu?**
Este card mostra onde o consumo mais caiu, do maior para o menor.
1. A lista começa por município.
2. Clique num município para ver os bairros dele.
3. Clique num bairro para ver as classes.
4. Para voltar, clique num nível do caminho acima da tabela, como **Todos os municípios**.

Escolher **Município** e **Bairro** nos filtros leva ao mesmo nível. As colunas são **Variação do volume**, **Efeito-preço**, **Efeito-volume**, **Volume** e **Receita de energia**. Verde é positivo e vermelho é negativo.

**Com e sem tributos.** Esta tela usa a receita de energia **sem tributos**. A **Receita faturada** do Painel executivo **inclui tributos**. Por isso os valores das duas telas são diferentes.

## Visão 360 da unidade consumidora {#unidade}
<!-- nivel: publico | rota: /unidades | palavras: unidade, uc, cliente, visão 360, buscar unidade, conta alta, faturas, medidor, painel solar, chamados -->

A **Visão 360 da UC** mostra tudo sobre uma unidade consumidora numa tela só.

**Como buscar**
1. No menu lateral, em **Clientes**, clique em **Visão 360 da UC**.
2. No campo **Código da UC ou nome do titular**, digite ao menos 3 caracteres.
3. Clique em **Buscar**.
4. Com o código completo, a unidade abre direto. Com parte do nome, aparece a lista **Resultados**: clique na linha da unidade.
5. Para trocar de unidade, clique em **Voltar para a busca**.

**O que cada bloco mostra**
- Topo: titular, código, classe, município, situação e o **Período analisado**.
- **A conta veio alta?**: o diagnóstico do último mês com consumo.
- **Consumo dos últimos 12 meses**: cada mês ao lado do mesmo mês do ano anterior. Em **Ver como tabela**, a coluna **Leitura** marca os meses com leitura **Estimada**.
- **Faturas**: as **Em aberto** e as **Pagas no período**, com **Valor total**, **Bandeira**, **Vencimento** e **Pago em**.
- **Cadastro**, **Medidor** e **Geração distribuída** (painel solar ou outra geração própria).
- **Interrupções de energia** e **Chamados** de atendimento.

**Quando o cliente diz "minha conta veio alta"**
1. Abra a unidade e leia o card **A conta veio alta?**. Ele compara o **Último mês** com o **Mesmo mês do ano anterior** e com a **Média dos meses anteriores**.
2. A etiqueta no canto compara com o ano anterior: **Consumo subiu** ou **Sem alta de consumo**.
3. O título e a orientação ao atendente, logo abaixo, dizem se o consumo explica a conta. Quando não explica, a causa está na tarifa, na bandeira tarifária ou nos tributos.
4. Se aparecer **Leitura estimada**, o consumo pode ser acertado na próxima leitura real. Clique em **Saiba mais** para ver os meses estimados.
5. Para ver mudança de bandeira, confira a coluna **Bandeira** em **Faturas**.

## Fila de inspeção {#fila}
<!-- nivel: publico | rota: /perdas/fila | palavras: fila, perdas, suspeitas, gato, fraude, inspeção, prioridade, score, gerar ordem, exportar fila -->

A **Fila de inspeção** lista as unidades suspeitas de perda e diz o que fazer com cada uma. No topo da página o título aparece como **Fila de perdas**.

O resumo no topo mostra **UCs analisadas**, **Priorizadas**, **Potencial de recuperação** e **Ordens em andamento**.

**Como a fila é ordenada.** O **Ranking priorizado** vai da maior para a menor **Prioridade**. Em empate, vem antes a UC com mais kWh estimado. A coluna **#** mostra a posição.

**O que as colunas querem dizer**
- **Prioridade:** o score, de 0 a 100. Combina potencial de recuperação, anomalias e histórico de inspeção. Não é a chance de haver fraude.
- **Motivos da suspeita:** os sinais que colocaram a UC na fila.
- **kWh estimado:** a energia que pode ser recuperada. É uma estimativa, não energia comprovada.
- **Confiança:** a força da evidência: **Alta**, **Média**, **Baixa** ou **Indeterminada**.
- **Ação recomendada:** **Inspeção prioritária** ou **Validação documental**. Só a primeira pode virar ordem.

**Como gerar ordens de inspeção**
1. Use os filtros para achar as unidades. Marque **Ocultar UCs com ordem ativa** para esconder as que já têm ordem.
2. Marque a caixa à esquerda de cada UC. Um cadeado quer dizer **Ordem em andamento**: essa UC não pode ser marcada.
3. Clique em **Gerar ordem de inspeção**.
4. Preencha **Equipe responsável** (obrigatório) e, se quiser, a **Data prevista**.
5. Clique em **Gerar ordens**. Cada UC ganha a sua ordem, com os motivos e o kWh estimado copiados da fila. Depois, a tela **Ordens de inspeção** abre sozinha.

**Exportar a fila**
1. Ajuste os filtros.
2. Clique em **Exportar CSV**. O arquivo traz a fila inteira do recorte, não só a página aberta.

## Ordens de inspeção {#ordens}
<!-- nivel: publico | rota: /perdas/ordens | palavras: ordens, ordem de inspeção, registrar resultado, cancelar ordem, em campo, concluir -->

A tela **Ordens de inspeção** acompanha cada ordem do começo ao fim. Para gerar uma ordem, use a **Fila de inspeção** (o botão **Fila de inspeção**, acima da lista, leva até lá).

**Os status**
- **Aberta:** a ordem foi criada e espera ir a campo.
- **Em campo:** a equipe foi despachada.
- **Concluída:** o resultado da vistoria foi registrado.
- **Cancelada:** a ordem foi encerrada sem vistoria.

A ordem segue Aberta, depois Em campo, depois Concluída. Aberta ou Em campo pode ser cancelada. Nenhuma ordem volta para Aberta.

**Achar uma ordem**
- Clique numa aba (**Todas**, **Aberta**, **Em campo**, **Concluída**, **Cancelada**) ou num quadro de contagem do topo.
- Digite o código em **Buscar UC...** e tecle Enter.
- Aqui, o filtro **Período atual** é o mês em que a ordem foi criada.

**Mandar a equipe a campo**
1. Na coluna **Ações**, clique no botão de três pontos da ordem.
2. Clique em **Iniciar campo**.
3. Confirme a **Equipe responsável**. As **Observações de despacho (opcional)** são livres.
4. Clique em **Despachar equipe**.

**Registrar o resultado** (só em ordens Em campo)
1. Em **Ações**, clique em **Registrar resultado**.
2. Escolha **Irregularidade confirmada** ou **Sem irregularidade (normal)**.
3. Se houve irregularidade, informe o **Tipo de irregularidade** e a **Energia recuperada (kWh)**.
4. Preencha **Observações e laudo técnico** (obrigatório). Se precisar, ajuste **Data e horário da vistoria** e **Inspetor responsável**.
5. Clique em **Concluir vistoria**.

**Cancelar uma ordem**
1. Em **Ações**, clique em **Cancelar ordem**.
2. Escreva a **Justificativa do cancelamento** (obrigatória).
3. Clique em **Confirmar cancelamento**. O motivo fica no histórico e a UC fica livre para outra ordem.

**Ver detalhes** mostra o contexto, o resultado e o **Histórico de alterações** da ordem.

## Continuidade DEC / FEC {#operacao}
<!-- nivel: publico | rota: /operacao | palavras: operação, dec, fec, falta de luz, interrupção, alimentador, continuidade, dia crítico, chi -->

A tela **Continuidade DEC / FEC** mostra as faltas de energia por alimentador e por região.

**O que os números medem**
- **DEC:** quantas horas, em média, cada UC ficou sem energia.
- **FEC:** quantas vezes, em média, cada UC ficou sem energia.
- **Interrupções:** as ocorrências no período.
- **CHI:** a soma das horas sem energia de todos os consumidores (consumidor-hora interrompido).

No período, DEC e FEC somam os índices de cada mês.

**Sem dias críticos.** Abaixo de DEC e FEC aparece **Sem dias críticos**: o mesmo índice sem contar os dias críticos. Um traço (—) quer dizer que a fonte não traz esse valor.

**Escolher período e região**
1. Use os filtros **Período atual**, **Município**, **Bairro** e **Alimentador**.
2. Para outro intervalo de meses, abra **Escolher outro período**, preencha **Mês inicial** e **Mês final** e clique em **Aplicar período**.

**Ver por alimentador e por região** (card **Rankings de continuidade**)
1. Clique em **Alimentadores** ou em **Municípios e bairros**.
2. Em **Ordenar por**, escolha **Maior DEC**, **Maior FEC** ou **Maior CHI**.
3. Em **Municípios e bairros**, use **Agrupar região por** para ver por **Município** ou por **Bairro**. Clicar numa região mostra os alimentadores dela.

**Abrir o histórico de um alimentador**
1. No ranking de **Alimentadores**, clique no nome do alimentador.
2. Ele vira o **Alimentador em análise**, no topo, com os seus indicadores.
3. O gráfico **Histórico por alimentador** mostra mês a mês. Troque entre **DEC** e **FEC**. A linha cheia é **Com dias críticos** e a tracejada é **Sem dias críticos**.
4. Use **Mês em destaque** para ler um mês, ou **Ver como tabela**.
5. Para voltar, clique em **Ver todos os alimentadores**.

Sem escolher nenhum, o alimentador em análise é o primeiro do ranking.

## Glossário {#glossario}
<!-- nivel: publico | rota: - | palavras: o que é, significa, glossário, termo, uc, competência, classe, alimentador, bandeira, perdas, gd, dec, fec -->

- **Unidade consumidora (UC):** o ponto que recebe energia e tem um medidor: uma casa, uma loja, uma fábrica.
- **Competência:** o mês a que a leitura ou a fatura se refere.
- **Classe:** residencial, comercial, industrial, rural ou poder público.
- **Alimentador:** o circuito da rede que abastece um conjunto de ruas e bairros.
- **Bandeira tarifária:** acréscimo na tarifa, definido mês a mês, que muda a conta sem mudar o consumo.
- **Perdas não técnicas:** energia entregue e não faturada (furto, fraude, erro de leitura ou cadastro).
- **Geração distribuída (GD):** a própria unidade gera energia, em geral com painel solar.
- **DEC / FEC:** duração e frequência equivalentes de interrupção por unidade consumidora.
- **Efeito-preço / efeito-volume:** a parte da variação da receita que veio da tarifa e a que veio da quantidade de energia.
- **P1 / P2:** julho/2022 a junho/2023 e julho/2025 a junho/2026.

## O que a plataforma não faz {#limites}
<!-- nivel: publico | rota: - | palavras: não faz, limite, não consigo, por que não aparece, dados até, atualização -->

- Os dados vão até junho de 2026. 2026 não está completo.
- O assistente e as telas só leem os dados. Quem altera dados são as telas de ordens de inspeção, ao gerar, atualizar ou cancelar uma ordem.
- A **Ponte da receita**, o card **Onde o volume caiu?** e a **Análise da IA** só funcionam na comparação **P2** contra **P1**. Com outros períodos aparece "Decomposição indisponível para este recorte".
- O botão **Exportar** no topo da tela fica desativado. Para baixar dados, use **Exportar CSV** na Fila de inspeção ou nas tabelas do Assistente V-Energy.
- Na Fila de inspeção, só UCs com **Inspeção prioritária** viram ordem. UCs com **Validação documental** não podem ser marcadas.
- Cada UC tem no máximo uma ordem ativa (Aberta ou Em campo) por vez.
- Ordens **Concluída** ou **Cancelada** não podem ser reabertas nem alteradas. Para elas só existe **Ver detalhes**.
- Na Visão 360, a busca pede ao menos 3 caracteres.
- Em **Municípios e bairros**, bairros que dividem o mesmo alimentador não podem ser somados.