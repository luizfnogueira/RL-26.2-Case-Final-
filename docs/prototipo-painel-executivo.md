# Protótipo — Painel executivo (T1 / Artur)

Branch: `feat/painel-executivo-prototipo`, criada de `origin/main` em 28/10/2026.
Esta entrega contém somente o frontend da Tela 1, seus componentes e testes.

## Abrir para a apresentação

No PowerShell, a partir da raiz do repositório:

```powershell
cd frontend
npm install
$env:VITE_USE_MOCKS = 'true'
npm run dev -- --host 127.0.0.1 --port 5173
```

Acesse **http://127.0.0.1:5173/painel**. O protótipo funciona sem backend e sem
login. Os dados vêm dos mocks existentes da equipe e são identificados pelo selo
**Dado fictício**. Não há novo contrato ou alteração de backend nesta branch.

## Roteiro curto de demonstração

1. Mostrar os seis KPIs: Receita faturada, Volume faturado, UCs ativas, Valor em
   aberto, DEC médio e FEC médio. Cada card apresenta atual, comparação e variação.
   Valor em aberto também mostra percentual da receita e variação em p.p.
2. Percorrer o histórico de 48 meses com o mouse ou com o seletor de mês.
   Receita usa o eixo esquerdo em R$ e volume o direito em kWh. As escalas são
   independentes, e a linha tracejada distingue volume sem depender só da cor.
3. Abrir **Ver como tabela** para conferir os valores mensais completos.
4. Escolher **Recife** no filtro de município: os KPIs e o histórico mudam.
   O mock existente não fornece DEC/FEC por município; os cards explicam a
   ausência e mostram travessão, preservando o comportamento da equipe.
5. Mostrar que a URL guarda o recorte; **Limpar filtros** volta ao consolidado.
6. Usar **Ver diagnóstico da receita**, que leva os mesmos períodos e município
   para a Tela 2 existente.

Os dois períodos disponíveis no mock são jul/2025–jun/2026 e jul/2022–jun/2023.
Outras janelas dependem da API real; o protótipo não fabrica cenários adicionais.

## Validação

```powershell
cd frontend
npm test
npm run build
npm run lint
```

Os testes novos cobrem carregamento, erro e tentativa novamente, consulta vazia,
filtros na URL, descarte visual do recorte anterior durante atualização, navegação,
precisão DEC/FEC, valores zero e ausentes, selo da fonte, tabela de 48 meses e
interrupção das linhas em lacunas. O layout usa os componentes e tokens existentes,
com seis cards no desktop amplo, três no tablet e um/dois em telas menores.

## Limite desta entrega

Protótipo para avaliação de design. A validação visual no navegador e o aceite
com a Gold real ainda precisam ocorrer. O serviço `buscarDashboard` e os tipos
da equipe são reutilizados; os domínios dos filtros continuam os mocks existentes.
Login, autenticação, Operação e a aba de comparação de recortes não integram esta
entrega. O trabalho local anterior foi preservado no stash identificado
`Artur AUTH-b R1a e docs locais antes do prototipo T1 2026-10-28`.
