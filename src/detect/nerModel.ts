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
onnxWasm.wasmPaths = {
  mjs: new URL(ortMjsUrl, self.location.href).href,
  wasm: new URL(ortWasmUrl, self.location.href).href,
}
// Multithreading needs COOP/COEP headers that GitHub Pages cannot set.
onnxWasm.numThreads = 1
env.allowLocalModels = false

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
