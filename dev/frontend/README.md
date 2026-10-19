# Frontend

React com TypeScript, Vite e Tailwind CSS.

## Executar

```bash
npm install
npm run dev
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
