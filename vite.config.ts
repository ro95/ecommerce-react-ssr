import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Custom SSR setup (no meta-framework): Vite provides the dev middleware and the
// client/SSR builds; the Express server in /server wires them together.
export default defineConfig({
  plugins: [react()],
  // Pin an explicit (empty) PostCSS config so Vite does NOT walk up the
  // directory tree and inherit a stray parent/home-level postcss.config.js
  // (e.g. a global Tailwind setup). Keeps the build hermetic & reproducible.
  css: { postcss: {} },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@shared': new URL('./shared', import.meta.url).pathname,
    },
  },
})
