import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    globals: false,
    include: ['src/**/*.test.ts', 'src/renderer/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['src/renderer/**/*.test.tsx', 'jsdom'],
      ['**/*', 'node'],
    ],
    setupFiles: ['./vitest.setup.ts'],
  },
})
