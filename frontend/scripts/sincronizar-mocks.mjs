// Copia os fixtures do backend (contrato V2) para os mocks do front.
// Uso: npm run mocks:sync
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const origem = join(aqui, '../../backend/app/services/fixtures')
const destino = join(aqui, '../src/data/mocks')

mkdirSync(destino, { recursive: true })

const arquivos = readdirSync(origem).filter((nome) => nome.endsWith('.json'))
for (const nome of arquivos) copyFileSync(join(origem, nome), join(destino, nome))

writeFileSync(
  join(destino, 'LEIA-ME.md'),
  [
    '# Mocks do front (DADOS FICTÍCIOS)',
    '',
    'Estes JSON são cópias de `backend/app/services/fixtures`, os exemplos do contrato V2',
    '(`docs/api-contract.md`). **Não edite aqui**: rode `npm run mocks:sync` na pasta `frontend`.',
    '',
    'Todos os valores são fictícios e não representam a Gold nem o diagnóstico real.',
    '',
  ].join('\n'),
)

console.log(`${arquivos.length} fixtures copiados para src/data/mocks`)
