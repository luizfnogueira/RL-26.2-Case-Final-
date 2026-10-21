/** Variáveis de ambiente do front (ver .env.example). */
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

/** true: usa mocks rotulados como fictícios e dispensa o backend. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'
