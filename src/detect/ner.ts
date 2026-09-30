// Turns the token output of a BERT NER model into entities with offsets in
// the page string. The model gives B-/I- labels on WordPiece tokens ("##"
// marks a subword), with no character offsets.

export type NerToken = {
  word: string
  entity: string
  score: number
}

export type NerType = 'person' | 'organization'

export type NerEntity = {
  type: NerType
  value: string
  start: number
  end: number
  score: number
  // The first word has an I- label: the model reads it as the continuation
  // of an entity, for instance one cut by a line break.
  startsInside: boolean
}

// Low on purpose: an uncertain entity is masked, the user can unmask it.
export const MIN_ENTITY_SCORE = 0.3

// BERT reads at most 512 tokens. 1000 characters stay well below that.
export const MAX_CHUNK_CHARS = 1000

const LABEL_TYPES: Record<string, NerType> = { PER: 'person', ORG: 'organization' }

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u

export type TextChunk = { text: string; offset: number }

// Splits a page string into chunks of at most `maxChars`, at line breaks
// when possible, then at spaces.
export function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): TextChunk[] {
  const chunks: TextChunk[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars)
    if (end < text.length) {
      const lineBreak = text.lastIndexOf('\n', end)
      const space = text.lastIndexOf(' ', end)
      if (lineBreak > start) end = lineBreak + 1
      else if (space > start) end = space + 1
    }
    chunks.push({ text: text.slice(start, end), offset: start })
    start = end
  }
  return chunks
}

type AlignedToken = NerToken & { start: number; end: number; subword: boolean }

// How far ahead a token may be found when the text holds characters the
// tokenizer dropped or replaced.
const MAX_SKIP = 20

// Finds each token in the text, in order. Tokens that cannot be placed,
// such as [UNK], are left out.
export function alignTokens(text: string, tokens: NerToken[]): AlignedToken[] {
  const aligned: AlignedToken[] = []
  let cursor = 0
  for (const token of tokens) {
    const subword = token.word.startsWith('##')
    const piece = subword ? token.word.slice(2) : token.word
    if (piece === '' || piece === '[UNK]') continue
    const found = text.indexOf(piece, cursor)
    if (found === -1 || found - cursor > MAX_SKIP) continue
    aligned.push({ ...token, start: found, end: found + piece.length, subword })
    cursor = found + piece.length
  }
  return aligned
}

type Word = { start: number; end: number; entity: string; score: number }

// A word is a token and the "##" subwords that follow it. Every subword
// takes the label of the first token of its word.
function toWords(tokens: AlignedToken[]): Word[] {
  const words: Word[] = []
  for (const token of tokens) {
    const last = words.at(-1)
    if (token.subword && last && last.end === token.start) {
      last.end = token.end
    } else {
      words.push({ start: token.start, end: token.end, entity: token.entity, score: token.score })
    }
  }
  return words
}

function labelOf(entity: string): { prefix: string; type: NerType | undefined } {
  const [prefix, label] = entity.split('-')
  return { prefix, type: label ? LABEL_TYPES[label] : undefined }
}

// Entities of one chunk of text, with offsets into that text.
export function aggregateEntities(text: string, tokens: NerToken[]): NerEntity[] {
  const entities: NerEntity[] = []
  let current: Omit<NerEntity, 'value'> | undefined

  const close = () => {
    if (current) entities.push(...finish(text, current))
    current = undefined
  }

  for (const word of toWords(alignTokens(text, tokens))) {
    const { prefix, type } = labelOf(word.entity)
    if (!type) {
      close()
      continue
    }
    const continues =
      current &&
      prefix === 'I' &&
      current.type === type &&
      !text.slice(current.end, word.start).includes('\n')
    if (continues && current) {
      current.end = word.end
      current.score = Math.max(current.score, word.score)
    } else {
      close()
      current = { type, start: word.start, end: word.end, score: word.score, startsInside: prefix === 'I' }
    }
  }
  close()
  return entities
}

// Extends an entity to the word boundaries in the text, trims punctuation
// at its ends, and drops it below the score threshold or at one character.
function finish(text: string, entity: Omit<NerEntity, 'value'>): NerEntity[] {
  if (entity.score < MIN_ENTITY_SCORE) return []
  let { start, end } = entity
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
  while (end < text.length && WORD_CHAR.test(text[end])) end++
  while (start < end && !WORD_CHAR.test(text[start])) start++
  while (end > start && !WORD_CHAR.test(text[end - 1])) end--
  const value = text.slice(start, end).replace(/\s+/g, ' ')
  if ([...value].filter((char) => WORD_CHAR.test(char)).length < 2) return []
  return [{ ...entity, value, start, end }]
}
