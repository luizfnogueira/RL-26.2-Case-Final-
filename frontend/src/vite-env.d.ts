/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_USE_MOCKS?: string
  readonly VITE_MOCK_DELAY_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
