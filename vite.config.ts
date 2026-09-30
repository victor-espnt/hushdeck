import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages serves the site under /hushdeck/.
export default defineConfig({
  base: '/hushdeck/',
  plugins: [react()],
  // The NER worker imports transformers.js, which uses dynamic imports.
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
