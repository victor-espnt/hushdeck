// Model setup shared by the NER workers. Import it from a worker only.
import {
  env,
  pipeline,
  type ProgressCallback,
  type TokenClassificationPipeline,
} from '@huggingface/transformers'
// Serve the ONNX Runtime files from this site instead of the jsDelivr default.
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

export const NER_MODEL = 'Xenova/bert-base-NER'

const onnxWasm = env.backends.onnx.wasm!
// The worker runs from a blob: URL, which cannot serve as a base URL.
onnxWasm.wasmPaths = {
  mjs: new URL(ortMjsUrl, self.location.origin).href,
  wasm: new URL(ortWasmUrl, self.location.origin).href,
}
// Multithreading needs COOP/COEP headers that GitHub Pages cannot set.
onnxWasm.numThreads = 1
env.allowLocalModels = false
// The wasm cache re-imports ONNX Runtime from a blob: URL, which the page's
// CSP (inherited by this worker) blocks. The runtime loads from this site's
// URLs instead; the model files stay in the browser cache.
env.useWasmCache = false

let loading: Promise<TokenClassificationPipeline> | undefined

// Loaded once per worker. The first caller's progress callback receives
// the download progress.
export function loadNer(onProgress?: ProgressCallback): Promise<TokenClassificationPipeline> {
  loading ??= pipeline('token-classification', NER_MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: onProgress,
  })
  return loading
}
