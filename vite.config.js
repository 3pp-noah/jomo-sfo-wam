import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// The site is served from a sub-path (https://3pp-noah.github.io/jomo-sfo-wam/), so every
// asset link is relative. /api/* never reaches a server: kernel/shim.js answers it in the page.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { outDir: 'docs', emptyOutDir: true },
})
