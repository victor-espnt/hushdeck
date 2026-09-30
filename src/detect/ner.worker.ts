/// <reference lib="webworker" />
import { env, pipeline, type TokenClassificationPipeline } from '@huggingface/transformers'
import { aggregateEntities, chunkText, type NerEntity, type NerToken } from './ner.ts'
// Serve the ONNX Runtime files from this site instead of the jsDelivr default.
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

export const NER_MODEL = 'Xenova/bert-base-NER'

export type FetchRecord = {
  url: string
  // After redirects: Hugging Face sends model files to CDN hosts.
  finalUrl: string
  status: number
  bytes: number
}

export type SmokeTestResult = {
  fetches: FetchRecord[]
  // Every host the worker reached, from fetch and Resource Timing.
  hosts: string[]
  downloadedBytes: number
  loadMs: number
  inferenceMs: number
  output: unknown
}

export type NerRequest =
  | { type: 'smoke-test'; text: string }
  | { type: 'analyze'; pages: string[] }
export type SmokeTestResponse =
  | { type: 'result'; result: SmokeTestResult }
  | { type: 'error'; message: string }
export type AnalyzeResponse =
  | { type: 'entities'; entities: NerEntity[][] }
  | { type: 'error'; message: string }

const onnxWasm = env.backends.onnx.wasm!
onnxWasm.wasmPaths = {
  mjs: new URL(ortMjsUrl, self.location.href).href,
  wasm: new URL(ortWasmUrl, self.location.href).href,
}
// Multithreading needs COOP/COEP headers that GitHub Pages cannot set.
onnxWasm.numThreads = 1
env.allowLocalModels = false

const fetches: FetchRecord[] = []

// Records every request transformers.js makes and counts the bytes it reads.
env.fetch = async (input: string | URL, init?: RequestInit) => {
  const response = await fetch(input, init)
  const record: FetchRecord = {
    url: String(input),
    finalUrl: response.url,
    status: response.status,
    bytes: 0,
  }
  fetches.push(record)
  if (!response.body) return response
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      record.bytes += chunk.byteLength
      controller.enqueue(chunk)
    },
  })
  return new Response(response.body.pipeThrough(counter), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

let nerPipeline: Promise<TokenClassificationPipeline> | undefined

// Loaded once per worker, then reused for every document.
function loadNer(): Promise<TokenClassificationPipeline> {
  nerPipeline ??= pipeline('token-classification', NER_MODEL, { dtype: 'q8', device: 'wasm' })
  return nerPipeline
}

// Entities of each page string, with offsets into that page string.
async function analyze(pages: string[]): Promise<NerEntity[][]> {
  const ner = await loadNer()
  const results: NerEntity[][] = []
  for (const page of pages) {
    const entities: NerEntity[] = []
    for (const chunk of chunkText(page)) {
      const tokens = (await ner(chunk.text, { ignore_labels: [] })) as NerToken[]
      for (const entity of aggregateEntities(chunk.text, tokens)) {
        entities.push({ ...entity, start: entity.start + chunk.offset, end: entity.end + chunk.offset })
      }
    }
    results.push(entities)
  }
  return results
}

async function smokeTest(text: string): Promise<SmokeTestResult> {
  const loadStart = performance.now()
  const ner = await loadNer()
  const loadMs = performance.now() - loadStart

  const inferenceStart = performance.now()
  const output = await ner(text)
  const inferenceMs = performance.now() - inferenceStart

  const resourceHosts = performance
    .getEntriesByType('resource')
    .map((entry) => new URL(entry.name).host)
  const fetchHosts = fetches.flatMap((f) => [new URL(f.url).host, new URL(f.finalUrl).host])
  return {
    fetches,
    hosts: [...new Set([...fetchHosts, ...resourceHosts])].sort(),
    downloadedBytes: fetches.reduce((sum, f) => sum + f.bytes, 0),
    loadMs,
    inferenceMs,
    output,
  }
}

self.onmessage = async (event: MessageEvent<NerRequest>) => {
  const request = event.data
  try {
    if (request.type === 'smoke-test') {
      const result = await smokeTest(request.text)
      self.postMessage({ type: 'result', result } satisfies SmokeTestResponse)
    } else {
      const entities = await analyze(request.pages)
      self.postMessage({ type: 'entities', entities } satisfies AnalyzeResponse)
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) } satisfies SmokeTestResponse)
  }
}
