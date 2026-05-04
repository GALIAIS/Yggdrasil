import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererDir = path.resolve(__dirname, '../apps/renderer')

const child = spawn('pnpm', ['build'], {
  cwd: rendererDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    ST_DESKTOP_SHELL: 'tauri',
  },
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
