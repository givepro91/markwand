import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
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
