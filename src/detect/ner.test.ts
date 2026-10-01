import { describe, expect, it } from 'vitest'
import { SAMPLE_DECK_PAGES } from './fixtures/sampleDeck.ts'
import { SAMPLE_DECK_NER } from './fixtures/sampleDeckNer.ts'
import {
  aggregateEntities,
  alignTokens,
  chunkText,
  MIN_ENTITY_SCORE,
  type NerToken,
} from './ner.ts'

const page = (n: number) => SAMPLE_DECK_PAGES[n - 1]
// What the model really produced on page n (see the fixture).
const tokens = (n: number): NerToken[] =>
  SAMPLE_DECK_NER[n - 1].map(([word, entity, score]) => ({ word, entity, score }))
const entities = (n: number) => aggregateEntities(page(n), tokens(n))
const values = (n: number) => entities(n).map((e) => e.value)

describe('alignTokens', () => {
  it('places every token of every sample deck page in the text', () => {
    for (let n = 1; n <= SAMPLE_DECK_PAGES.length; n++) {
      expect(alignTokens(page(n), tokens(n))).toHaveLength(tokens(n).length)
    }
  })

  it('skips [UNK] and tokens it cannot find', () => {
    const aligned = alignTokens('Jane ☃ Doe', [
      { word: 'Jane', entity: 'B-PER', score: 1 },
      { word: '[UNK]', entity: 'O', score: 1 },
      { word: 'Doe', entity: 'I-PER', score: 1 },
    ])
    expect(aligned.map((t) => [t.word, t.start])).toEqual([
      ['Jane', 0],
      ['Doe', 7],
    ])
  })
})

describe('aggregateEntities on the model output for page 7', () => {
  it('gives "##ois" the label of "Dub": Claire Dubois is one person', () => {
    // Raw: Claire/B-PER Dub/I-PER ##ois/I-ORG
    expect(entities(7)).toContainEqual(
      expect.objectContaining({ type: 'person', value: 'Claire Dubois' }),
    )
  })

  it('extends to word limits: Marcus Okafor, Priya Raman', () => {
    // Raw: Ok/I-PER ##af/I-PER ##or/O, and Rama/I-PER ##n/O
    expect(values(7)).toContain('Marcus Okafor')
    expect(values(7)).toContain('Priya Raman')
  })

  it('keeps multi-word organizations whole', () => {
    expect(values(7)).toContain('Kestrel Freight')
    expect(values(7)).toContain('Fenwick & Hale')
    expect(values(7)).toContain('Tom Whitfield')
  })

  it('ends an entity at a line break', () => {
    // Raw: ... Ha/I-ORG ##ula ##ge, then "Ni" I-ORG on the next line.
    expect(values(7)).toContain('Aurigny Haulage')
    expect(values(7)).toContain('Nimbalo')
  })

  it('keeps low-confidence initials: fail closed', () => {
    // CD/B-ORG 0.51, PR/I-ORG 0.64
    expect(values(7)).toEqual(expect.arrayContaining(['CD', 'PR']))
  })

  it('returns offsets into the page string', () => {
    for (const entity of entities(7)) {
      expect(page(7).slice(entity.start, entity.end)).toBe(entity.value)
    }
  })
})

describe('Nimbalo, as the model really sees it', () => {
  it('is found on pages 2, 3, 5, 7 and 9, not on 1, 4, 6 and 8', () => {
    const found = SAMPLE_DECK_PAGES.map((_, i) => values(i + 1).includes('Nimbalo'))
    expect(found).toEqual([false, true, true, false, true, false, true, false, true])
  })

  it('is tagged a person on some pages and an organization on others', () => {
    const types = new Set(
      SAMPLE_DECK_PAGES.flatMap((_, i) => entities(i + 1))
        .filter((e) => e.value === 'Nimbalo')
        .map((e) => e.type),
    )
    expect(types).toEqual(new Set(['person', 'organization']))
  })
})

describe('aggregateEntities rules', () => {
  const token = (word: string, entity: string, score = 0.9): NerToken => ({ word, entity, score })

  it('ignores locations and miscellaneous entities', () => {
    // Page 6: A/B-MISC Europe/B-LOC France/B-LOC UK/B-LOC
    expect(entities(6)).toEqual([])
  })

  it('drops one-character fragments', () => {
    expect(aggregateEntities('Plan A works', [token('Plan', 'O'), token('A', 'B-PER'), token('works', 'O')])).toEqual([])
  })

  it(`keeps an entity scored ${MIN_ENTITY_SCORE} or more, drops one below`, () => {
    const text = 'Ask Jane'
    const at = (score: number) => aggregateEntities(text, [token('Ask', 'O'), token('Jane', 'B-PER', score)])
    expect(at(MIN_ENTITY_SCORE)).toHaveLength(1)
    expect(at(MIN_ENTITY_SCORE - 0.01)).toEqual([])
  })

  it('starts a new entity at a B- label', () => {
    const text = 'Jane Doe John Roe'
    const result = aggregateEntities(text, [
      token('Jane', 'B-PER'),
      token('Doe', 'I-PER'),
      token('John', 'B-PER'),
      token('Roe', 'I-PER'),
    ])
    expect(result.map((e) => e.value)).toEqual(['Jane Doe', 'John Roe'])
  })
})

describe('chunkText', () => {
  it('keeps a short page whole', () => {
    expect(chunkText(page(7))).toEqual([{ text: page(7), offset: 0 }])
  })

  it('cuts a long page at line breaks, with offsets', () => {
    const text = 'aaaa\nbbbb\ncccc'
    const chunks = chunkText(text, 10)
    expect(chunks.map((c) => c.text)).toEqual(['aaaa\nbbbb\n', 'cccc'])
    expect(chunks.map((c) => c.offset)).toEqual([0, 10])
  })

  it('falls back to spaces, then to a hard cut', () => {
    expect(chunkText('aaaa bbbb cccc', 10).map((c) => c.text)).toEqual(['aaaa bbbb ', 'cccc'])
    expect(chunkText('abcdefghij', 4).map((c) => c.text)).toEqual(['abcd', 'efgh', 'ij'])
  })
})
