import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'comark-tiptap/vue': fileURLToPath(new URL('./src/vue/index.ts', import.meta.url)),
      'comark-tiptap': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
    coverage: {
      exclude: ['dist/**', 'test/**', 'playground/**', 'build.config.ts', 'vitest.config.ts'],
    },
  },
})
