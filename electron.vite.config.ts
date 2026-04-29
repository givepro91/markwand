import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // electron-store v10은 ESM 전용 패키지이므로 번들에서 제외하고
        // main process에서 동적 import로 로드한다 (R2 대응)
        external: ['electron-store', 'execa', 'which']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer')
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    }
  }
})
