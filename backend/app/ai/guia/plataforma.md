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

**Filtros.** [COMPLETAR: onde ficam os filtros, quais existem (período, município, bairro, classe) e o que acontece ao mudar um filtro.]

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

[COMPLETAR: limites que o usuário percebe, por exemplo o tamanho máximo da pergunta e o que fazer quando aparecer a mensagem de assistente indisponível.]

## Como o assistente chega à resposta {#assistente-como-funciona}
<!-- nivel: publico | rota: /assistente | palavras: como funciona o assistente, como a ia funciona, de onde vem a resposta, confiar, auditar, como cheguei nisso, inventa -->

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
<!-- nivel: publico | rota: - | palavras: insight, resumo automático, texto da ia na tela, explicação -->

[COMPLETAR: em quais telas aparece o texto gerado por IA, o que ele resume, como ler e o que significam os marcadores.]

## Painel executivo {#painel}
<!-- nivel: publico | rota: /painel | palavras: painel, painel executivo, indicadores, kpi, início, resumo -->

[COMPLETAR: o que cada indicador mostra; como comparar períodos; o que significam a cor e a seta da variação; para onde levam os links.]

## Diagnóstico da receita {#receita}
<!-- nivel: publico | rota: /receita | palavras: receita, diagnóstico, efeito preço, efeito volume, ponte, cascata, por bairro, por classe -->

[COMPLETAR: como ler a ponte P1 → P2 (preço × volume); como descer de município para bairro e para classe; o que é o card "Onde o volume caiu?"; a diferença entre receita com e sem tributos.]

## Visão 360 da unidade consumidora {#unidade}
<!-- nivel: publico | rota: /unidades | palavras: unidade, uc, cliente, visão 360, buscar unidade, conta alta, faturas, medidor, painel solar, chamados -->

[COMPLETAR: passo a passo para buscar pelo número da UC ou pelo nome; o que cada bloco mostra; como responder ao cliente que diz "minha conta veio alta" usando o diagnóstico.]

## Fila de inspeção {#fila}
<!-- nivel: publico | rota: /perdas/fila | palavras: fila, perdas, suspeitas, gato, fraude, inspeção, prioridade, score, gerar ordem, exportar fila -->

[COMPLETAR: o que é a fila e como ela é ordenada; o que significam score, motivos e kWh estimado; passo a passo para selecionar unidades e gerar ordens; exportar CSV.]

## Ordens de inspeção {#ordens}
<!-- nivel: publico | rota: /perdas/ordens | palavras: ordens, ordem de inspeção, registrar resultado, cancelar ordem, em campo, concluir -->

[COMPLETAR: os status de uma ordem (aberta, em campo, concluída, cancelada); passo a passo para registrar o resultado e para cancelar.]

## Continuidade DEC / FEC {#operacao}
<!-- nivel: publico | rota: /operacao | palavras: operação, dec, fec, falta de luz, interrupção, alimentador, continuidade, dia crítico, chi -->

[COMPLETAR: o que DEC e FEC medem; como ver por alimentador e por região; o que é "sem dia crítico"; como abrir o histórico de um alimentador.]

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
- [COMPLETAR: outras limitações que o usuário encontra.]
