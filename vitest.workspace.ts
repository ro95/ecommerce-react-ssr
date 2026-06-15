import { defineWorkspace } from 'vitest/config'

// Two projects, two environments: the BFF/server code is plain Node, the React
// front needs a DOM. Both inherit Vite's aliases (@/ and @shared/) via `extends`.
export default defineWorkspace([
  {
    extends: './vite.config.ts',
    test: {
      name: 'server',
      environment: 'node',
      include: ['server/**/*.test.ts'],
    },
  },
  {
    extends: './vite.config.ts',
    test: {
      name: 'web',
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  },
])
