import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendTarget = process.env.ST_BACKEND_URL ?? 'http://127.0.0.1:8000'
const isDesktopShell = process.env.YGGDRASIL_DESKTOP_SHELL === 'desktop' || process.env.ST_DESKTOP_SHELL === 'tauri'

// https://vite.dev/config/
export default defineConfig({
  base: isDesktopShell ? './' : '/app/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('src/locales/')) {
            return 'locales'
          }

          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler')) {
              return 'react-vendor'
            }

            if (id.includes('@tanstack')) {
              return 'query-vendor'
            }

            if (id.includes('recharts') || id.includes('d3-')) {
              return 'charts-vendor'
            }

            if (
              id.includes('@base-ui') ||
              id.includes('@radix-ui') ||
              id.includes('cmdk') ||
              id.includes('vaul') ||
              id.includes('embla-carousel-react')
            ) {
              return 'ui-vendor'
            }

            return 'vendor'
          }

          return undefined
        },
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@yggdrasil/api-client': path.resolve(__dirname, '../../packages/api-client/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: false,
      },
      '/callback': {
        target: backendTarget,
        changeOrigin: false,
      },
      '/csrf-token': {
        target: backendTarget,
        changeOrigin: false,
      },
      '/login': {
        target: backendTarget,
        changeOrigin: false,
      },
      '/thumbnail': {
        target: backendTarget,
        changeOrigin: false,
      },
      '/version': {
        target: backendTarget,
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
