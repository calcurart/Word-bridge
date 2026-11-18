import { ALIASES, LINK_NOTES, LINKS } from '../data/links.ts'

/** One accepted connection: `from` followed by `to` makes `phrase`. */
export type Link = {
  readonly from: string
  readonly to: string
  readonly phrase: string
  readonly note?: string
}

/** The curated dictionary as a directed graph. Words are nodes, links are edges. */
export type WordGraph = {
  readonly links: ReadonlyMap<string, Link>
  /** Words that can follow each word, sorted alphabetically for deterministic searches. */
  readonly next: ReadonlyMap<string, readonly string[]>
  /** Words that can precede each word. */
  readonly previous: ReadonlyMap<string, readonly string[]>
  readonly words: ReadonlySet<string>
  /** Accepted spelling variant -> word used in the graph. */
  readonly aliases: ReadonlyMap<string, string>
}

const WORD = /^[a-z]+$/
const SOURCE = /^([a-z]+)([+ -])([a-z]+)$/

export const linkKey = (from: string, to: string): string => `${from} ${to}`

/** Parses a source entry such as 'sun+flower' or 'flower pot'. Returns null when malformed. */
export function parseLink(source: string): Link | null {
  const match = SOURCE.exec(source)
  if (!match) return null
  const [, from, joiner, to] = match
  return { from, to, phrase: joiner === '+' ? from + to : `${from}${joiner}${to}` }
}

export function buildGraph(
  sources: readonly string[] = LINKS,
  notes: Readonly<Record<string, string>> = LINK_NOTES,
  aliases: Readonly<Record<string, string>> = ALIASES,
): WordGraph {
  const links = new Map<string, Link>()
  const next = new Map<string, string[]>()
  const previous = new Map<string, string[]>()
  const add = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }

  for (const source of sources) {
    const link = parseLink(source)
    if (!link) continue
    const key = linkKey(link.from, link.to)
    if (links.has(key) || link.from === link.to) continue
    const note = Object.hasOwn(notes, key) ? notes[key] : undefined
    links.set(key, note ? { ...link, note } : link)
    add(next, link.from, link.to)
    add(previous, link.to, link.from)
  }
  for (const list of [...next.values(), ...previous.values()]) list.sort()

  const words = new Set([...next.keys(), ...previous.keys()])
  // Ambiguous aliases (a variant that is itself a word, or that points nowhere) are ignored here
  // and reported by the content audit.
  const aliasMap = new Map(
    Object.entries(aliases).filter(([variant, word]) => WORD.test(variant) && words.has(word) && !words.has(variant)),
  )
  return { links, next, previous, words, aliases: aliasMap }
}

export const GRAPH: WordGraph = buildGraph()

/** Trims, lowercases and Unicode-normalises what the player typed. Internal spaces are kept so they can be reported. */
export function normalizeEntry(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** True when a normalised entry is a single word made of letters. */
export function isSingleWord(normalized: string): boolean {
  return WORD.test(normalized)
}

/** Maps a supported spelling variant to the word used in the graph. */
export function canonicalWord(graph: WordGraph, normalized: string): string {
  return graph.aliases.get(normalized) ?? normalized
}

export function findLink(graph: WordGraph, from: string, to: string): Link | undefined {
  return graph.links.get(linkKey(canonicalWord(graph, from), canonicalWord(graph, to)))
}

/** Checks every adjacent pair in a chain of normalised words, left to right. */
export function evaluateChain(graph: WordGraph, words: readonly string[]): boolean[] {
  const results: boolean[] = []
  for (let index = 0; index < words.length - 1; index++) {
    results.push(findLink(graph, words[index], words[index + 1]) !== undefined)
  }
  return results
}
