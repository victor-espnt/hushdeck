import type { NerEntity } from './ner.ts'
import type { AnalyzeResponse, NerRequest } from './ner.worker.ts'

let worker: Worker | undefined

// Runs the NER model off the main thread. The worker, and the model it
// loads, are kept for the next document.
export function detectEntities(pages: string[]): Promise<NerEntity[][]> {
  worker ??= new Worker(new URL('./ner.worker.ts', import.meta.url), { type: 'module' })
  const current = worker
  return new Promise((resolve, reject) => {
    current.onmessage = (event: MessageEvent<AnalyzeResponse>) => {
      if (event.data.type === 'entities') resolve(event.data.entities)
      else reject(new Error(event.data.message))
    }
    current.onerror = (event) => reject(new Error(event.message))
    current.postMessage({ type: 'analyze', pages } satisfies NerRequest)
  })
}
