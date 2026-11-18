import { linkKey } from './graph.ts'
import type { WordGraph } from './graph.ts'

/**
 * Finds bridges from `start` to `end` with exactly `gaps` words in between.
 *
 * `fixed[gap]`, when set, forces the word at that gap (used for revealed hints).
 * Paths never repeat a word. Results come back in alphabetical (deterministic)
 * order and the search stops after `limit` paths, so it is always bounded: with
 * at most three gaps and a curated graph it visits a few thousand nodes at most.
 */
export function findPaths(
  graph: WordGraph,
  start: string,
  end: string,
  gaps: number,
  fixed: readonly (string | null | undefined)[] = [],
  limit = 2000,
): string[][] {
  const length = gaps + 1
  if (gaps < 1 || start === end) return []

  // reach[k]: words that can reach `end` in exactly k links. Used to prune dead branches early.
  const reach: Set<string>[] = [new Set([end])]
  for (let steps = 1; steps < length; steps++) {
    const layer = new Set<string>()
    for (const word of reach[steps - 1]) for (const before of graph.previous.get(word) ?? []) layer.add(before)
    reach.push(layer)
  }

  const results: string[][] = []
  const path: string[] = []
  const used = new Set([start, end])

  const visit = (word: string, position: number) => {
    if (results.length >= limit) return
    if (position === gaps) {
      if (graph.links.has(linkKey(word, end))) results.push([...path])
      return
    }
    const required = fixed[position]
    for (const candidate of graph.next.get(word) ?? []) {
      if (required && candidate !== required) continue
      if (used.has(candidate) || !reach[length - position - 1].has(candidate)) continue
      used.add(candidate)
      path.push(candidate)
      visit(candidate, position + 1)
      path.pop()
      used.delete(candidate)
      if (results.length >= limit) return
    }
  }

  visit(start, 0)
  return results
}
