import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = process.env.OPENSHELL_UI_BACKEND ?? 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        ws: true,
        // The backend accepts writes and WebSocket upgrades only when Origin
        // matches its own Host, so present the dev proxy as same-origin.
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => {
            if (req.getHeader('origin')) req.setHeader('origin', backend)
          })
          proxy.on('proxyReqWs', (req) => {
            req.setHeader('origin', backend)
          })
        },
      },
    },
  },
  // Scan every page up front: pages load lazily, and a dependency found
  // late makes the dev server re-bundle and reload.
  optimizeDeps: { entries: ['src/**/*.tsx'] },
  build: {
    outDir: 'dist',
    // The backend embeds dist/ in its binary; maps would triple its size.
    sourcemap: false,
    // The shell chunk (React, router, query, UI primitives) is ~160 kB gzip
    // and served from loopback; pages, the editor and xterm load lazily.
    chunkSizeWarningLimit: 600,
  },
})
