/// <reference lib="webworker" />
import { aggregateEntities, chunkText, type NerEntity, type NerToken } from './ner.ts'
import { loadNer } from './nerModel.ts'

export type NerRequest = { type: 'analyze'; pages: string[] }

export type NerResponse =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'page'; pageIndex: number; entities: NerEntity[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

const post = (response: NerResponse) => self.postMessage(response)

// Entities of one page string, with offsets into it.
async function analyzePage(page: string): Promise<NerEntity[]> {
  const ner = await loadNer()
  const entities: NerEntity[] = []
  for (const chunk of chunkText(page)) {
    const tokens = (await ner(chunk.text, { ignore_labels: [] })) as NerToken[]
    for (const entity of aggregateEntities(chunk.text, tokens)) {
      entities.push({ ...entity, start: entity.start + chunk.offset, end: entity.end + chunk.offset })
    }
  }
  return entities
}

self.onmessage = async (event: MessageEvent<NerRequest>) => {
  try {
    await loadNer((info) => {
      if (info.status === 'progress_total') post({ type: 'download', loaded: info.loaded, total: info.total })
    })
    // One message per page, so masks appear as soon as each page is done.
    for (const [pageIndex, page] of event.data.pages.entries()) {
      post({ type: 'page', pageIndex, entities: await analyzePage(page) })
    }
    post({ type: 'done' })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
