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

// GitHub Pages cannot set response headers, so the policy ships as a meta
// tag. Build only: the dev server relies on inline scripts.
// - wasm-unsafe-eval: ONNX Runtime compiles WebAssembly. No unsafe-eval:
//   pdf.js 6 never evaluates code.
// - connect-src: the NER model downloads from Hugging Face, which redirects
//   to its CDN hosts under hf.co.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  // Workers start from blob: URLs so that they inherit this policy.
  "worker-src 'self' blob:",
  "connect-src 'self' https://huggingface.co https://*.hf.co",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  }
}

// GitHub Pages serves the site under /hushdeck/.
export default defineConfig({
  base: '/hushdeck/',
  plugins: [react(), contentSecurityPolicy()],
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
