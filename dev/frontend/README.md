# Frontend

React com TypeScript, Vite e Tailwind CSS.

## Executar

```bash
npm install
npm run dev
```

## Verificar

```bash
npm run build
npm run lint
```

O build verifica os tipos antes de gerar a pasta `dist`.

## Estrutura

```text
src/
├── assets/                 # Imagens e ícones
├── components/
│   ├── common/             # Componentes compartilhados
│   ├── receita/
│   ├── unidades/
│   ├── inspecoes/
│   ├── operacao/
│   └── assistente/
├── data/                   # Mocks e valores estáticos
├── hooks/                  # Consultas, ações e estado reutilizável
├── layouts/                # Menu, cabeçalho e área de conteúdo
├── pages/                  # Composição de cada tela
│   └── HomePage.tsx
├── services/               # Cliente HTTP e chamadas à API
├── types/                  # Contratos TypeScript
├── App.tsx                 # Composição principal; futuras rotas
├── index.css               # Entrada do Tailwind e tema global
└── main.tsx                # Inicialização do React
```

As pastas vazias usam `.gitkeep` para serem versionadas no Git.
A tela inicial está em `pages/HomePage.tsx`. Os componentes de domínio e as rotas serão implementados conforme as funcionalidades forem definidas.

Referências de configuração:
- https://tailwindcss.com/docs/installation/using-vite
- https://typescript-eslint.io/getting-started/
