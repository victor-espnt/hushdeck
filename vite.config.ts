import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// transformers.js bundles a reference to the "asyncify" ONNX Runtime build,
// so Vite emits that 27 MB file. The NER model loads the plain build from
// this site instead (see src/detect/nerModel.ts): drop the unused file.
function dropUnusedOnnxRuntime(): Plugin {
  return {
    name: 'drop-unused-onnx-runtime',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/ort-wasm-simd-threaded\.asyncify-[\w-]+\.wasm$/.test(fileName)) delete bundle[fileName]
      }
    },
  }
}

// GitHub Pages serves the site under /hushdeck/.
export default defineConfig({
  base: '/hushdeck/',
  plugins: [react()],
  // The NER workers import transformers.js, which uses dynamic imports.
  worker: {
    format: 'es',
    plugins: () => [dropUnusedOnnxRuntime()],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
