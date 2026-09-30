import { SAMPLE_DECK_PAGES } from './fixtures/sampleDeck.ts'
import type { NerRequest, SmokeTestResponse, SmokeTestResult } from './ner.worker.ts'

// Debug only: runs the NER model on page 7 of the fictional sample deck,
// never on the user's document, and logs what it costs.
export function runNerSmokeTest(): Promise<SmokeTestResult> {
  const worker = new Worker(new URL('./ner.worker.ts', import.meta.url), { type: 'module' })
  return new Promise<SmokeTestResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<SmokeTestResponse>) => {
      if (event.data.type === 'result') resolve(event.data.result)
      else reject(new Error(event.data.message))
    }
    worker.onerror = (event) => reject(new Error(event.message))
    worker.postMessage({ type: 'smoke-test', text: SAMPLE_DECK_PAGES[6] } satisfies NerRequest)
  })
    .then((result) => {
      logResult(result)
      return result
    })
    .finally(() => worker.terminate())
}

function logResult(result: SmokeTestResult) {
  const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1) + ' MB'
  console.group('NER smoke test')
  console.log('Downloaded:', megabytes(result.downloadedBytes))
  console.log('Hosts contacted:', result.hosts)
  console.table(
    result.fetches.map((f) => ({
      url: f.url,
      finalHost: new URL(f.finalUrl).host,
      status: f.status,
      size: megabytes(f.bytes),
    })),
  )
  console.log('Load:', Math.round(result.loadMs), 'ms')
  console.log('Inference:', Math.round(result.inferenceMs), 'ms')
  console.log('Raw output:', result.output)
  console.groupEnd()
}
