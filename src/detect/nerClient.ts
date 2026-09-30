import type { NerEntity } from './ner.ts'
import type { NerRequest, NerResponse } from './ner.worker.ts'
// Inline: the worker starts from a blob: URL and so inherits the page's
// Content-Security-Policy, which a worker loaded from its own URL does not.
import NerWorker from './ner.worker.ts?worker&inline'

export type NerHandlers = {
  onDownload: (loaded: number, total: number) => void
  onPage: (pageIndex: number, entities: NerEntity[]) => void
}

let worker: Worker | undefined
let busy = false

// Runs the NER model off the main thread and reports each page as it is
// done. The worker keeps the model for the next document; a run still in
// progress when a new one starts is stopped with its worker.
export function detectEntities(pages: string[], handlers: NerHandlers): Promise<void> {
  if (busy) {
    worker?.terminate()
    worker = undefined
  }
  worker ??= new NerWorker()
  const current = worker
  busy = true
  return new Promise<void>((resolve, reject) => {
    current.onmessage = (event: MessageEvent<NerResponse>) => {
      const message = event.data
      if (message.type === 'download') handlers.onDownload(message.loaded, message.total)
      else if (message.type === 'page') handlers.onPage(message.pageIndex, message.entities)
      else if (message.type === 'done') resolve()
      else reject(new Error(message.message))
    }
    current.onerror = (event) => reject(new Error(event.message))
    current.postMessage({ type: 'analyze', pages } satisfies NerRequest)
  }).finally(() => {
    if (worker === current) busy = false
  })
}
