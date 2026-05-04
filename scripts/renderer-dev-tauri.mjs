import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererDir = path.resolve(__dirname, '../apps/renderer')
const devServerUrl = process.env.ST_TAURI_DEV_URL ?? 'http://127.0.0.1:5173'
const viteClientCandidates = [
  new URL('/@vite/client', devServerUrl).toString(),
  new URL('/app/@vite/client', devServerUrl).toString(),
]

async function hasLiveViteServer() {
  for (const candidate of viteClientCandidates) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1500)

    try {
      const response = await fetch(candidate, {
        signal: controller.signal,
        headers: {
          Accept: 'text/javascript',
        },
      })

      if (response.ok) {
        return true
      }
    } catch {
      // Try the next possible Vite client path.
    } finally {
      clearTimeout(timeout)
    }
  }

  return false
}

async function main() {
  if (await hasLiveViteServer()) {
    console.log(`[tauri-dev] Reusing existing renderer dev server: ${devServerUrl}`)
    return
  }

  const child =
    process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'pnpm dev'], {
          cwd: rendererDir,
          stdio: 'inherit',
          env: {
            ...process.env,
            ST_DESKTOP_SHELL: 'tauri',
          },
        })
      : spawn('pnpm', ['dev'], {
          cwd: rendererDir,
          stdio: 'inherit',
          env: {
            ...process.env,
            ST_DESKTOP_SHELL: 'tauri',
          },
        })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })
}

await main()
