/// <reference lib="webworker" />
// Debug only: measures what loading and running the NER model costs.
import { env } from '@huggingface/transformers'
import { loadNer } from '../detect/nerModel.ts'

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

export type SmokeTestRequest = { type: 'smoke-test'; text: string }
export type SmokeTestResponse =
  | { type: 'result'; result: SmokeTestResult }
  | { type: 'error'; message: string }

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

self.onmessage = async (event: MessageEvent<SmokeTestRequest>) => {
  try {
    const result = await smokeTest(event.data.text)
    self.postMessage({ type: 'result', result } satisfies SmokeTestResponse)
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) } satisfies SmokeTestResponse)
  }
}
