import type { Puzzle } from '../data/puzzles.ts'
import { canonicalWord, evaluateChain, findLink, GRAPH, isSingleWord, normalizeEntry } from './graph.ts'
import type { Link, WordGraph } from './graph.ts'
import { findPaths } from './paths.ts'

export const MAX_CHECKS = 5
export const MAX_ENTRY_LENGTH = 24

/** A submitted bridge: the gap words as typed (normalised) and whether each link was recognised. */
export type Attempt = { readonly words: readonly string[]; readonly links: readonly boolean[] }
export type Hint = { readonly gap: number; readonly word: string }
/** Feedback for one link of the current entries: true/false from a check, or null when not (or no longer) checked. */
export type LinkFeedback = boolean | null

/** Everything needed to restore a game. Status is derived, never stored. */
export type GameRecord = {
  readonly puzzleId: string
  /** Gap entries exactly as typed (hint words are stored in lowercase). */
  readonly entries: readonly string[]
  readonly hints: readonly Hint[]
  readonly attempts: readonly Attempt[]
  /** One entry per link (gaps + 1), describing the words currently on screen. */
  readonly feedback: readonly LinkFeedback[]
}

export type Status = 'playing' | 'won' | 'lost'

export function newGame(puzzle: Puzzle): GameRecord {
  return {
    puzzleId: puzzle.id,
    entries: Array.from({ length: puzzle.gaps }, () => ''),
    hints: [],
    attempts: [],
    feedback: Array.from({ length: puzzle.gaps + 1 }, () => null),
  }
}

export function gameStatus(record: GameRecord): Status {
  const last = record.attempts.at(-1)
  if (last && last.links.every(Boolean)) return 'won'
  return record.attempts.length >= MAX_CHECKS ? 'lost' : 'playing'
}

export const checksLeft = (record: GameRecord): number => MAX_CHECKS - record.attempts.length
/** Up to two hints, but always leave at least one gap for the player. */
export const maxHints = (puzzle: Puzzle): number => Math.min(2, puzzle.gaps - 1)
export const hintsLeft = (puzzle: Puzzle, record: GameRecord): number => maxHints(puzzle) - record.hints.length
export const isHinted = (record: GameRecord, gap: number): boolean => record.hints.some(hint => hint.gap === gap)

/** True once the player has done anything worth keeping. */
export function hasProgress(record: GameRecord): boolean {
  return record.attempts.length > 0 || record.hints.length > 0 || record.entries.some(entry => entry.trim() !== '')
}

/**
 * How far the progress car has driven: the number of recognized links in a row, counting from the
 * start word. A link that is unchecked (because a word changed) or unrecognized stops the car there.
 */
export function carProgress(feedback: readonly LinkFeedback[]): number {
  const stop = feedback.findIndex(state => state !== true)
  return stop === -1 ? feedback.length : stop
}

export function fullChain(puzzle: Puzzle, words: readonly string[]): string[] {
  return [puzzle.start, ...words, puzzle.end]
}

/** The phrase made by each link of a chain (undefined where the link is not in the dictionary). */
export function chainLinks(chain: readonly string[], graph: WordGraph = GRAPH): (Link | undefined)[] {
  return chain.slice(0, -1).map((word, index) => findLink(graph, word, chain[index + 1]))
}

function replaceEntry(record: GameRecord, gap: number, text: string): GameRecord {
  const before = record.entries[gap]
  if (text === before) return record
  const entries = record.entries.map((entry, index) => (index === gap ? text : entry))
  // Feedback belongs to the submitted words. Changing a word makes both of its links outdated.
  const changed = normalizeEntry(text) !== normalizeEntry(before)
  const feedback = changed
    ? record.feedback.map((state, link) => (link === gap || link === gap + 1 ? null : state))
    : record.feedback
  return { ...record, entries, feedback }
}

/** Updates one gap. Ignored for revealed (hinted) gaps and finished games. */
export function editEntry(record: GameRecord, gap: number, value: string): GameRecord {
  if (gameStatus(record) !== 'playing' || gap < 0 || gap >= record.entries.length || isHinted(record, gap)) return record
  return replaceEntry(record, gap, value.slice(0, MAX_ENTRY_LENGTH))
}

const bridgeKey = (graph: WordGraph, words: readonly string[]) =>
  words.map(word => canonicalWord(graph, word)).join(' ')

export type CheckResult =
  | { readonly kind: 'finished' }
  /** Some gaps are empty. No check is used. */
  | { readonly kind: 'incomplete'; readonly gaps: readonly number[] }
  /** Some gaps hold more than one word or non-letters. No check is used. */
  | { readonly kind: 'not-one-word'; readonly gaps: readonly number[] }
  /** The same bridge (after normalising) was already checked. No check is used; its feedback is restored. */
  | { readonly kind: 'duplicate'; readonly attempt: number; readonly record: GameRecord }
  | { readonly kind: 'checked'; readonly links: readonly boolean[]; readonly record: GameRecord }

export function checkBridge(puzzle: Puzzle, record: GameRecord, graph: WordGraph = GRAPH): CheckResult {
  if (gameStatus(record) !== 'playing') return { kind: 'finished' }
  const words = record.entries.map(normalizeEntry)
  const empty = words.flatMap((word, gap) => (word === '' ? [gap] : []))
  if (empty.length > 0) return { kind: 'incomplete', gaps: empty }
  const invalid = words.flatMap((word, gap) => (isSingleWord(word) ? [] : [gap]))
  if (invalid.length > 0) return { kind: 'not-one-word', gaps: invalid }

  const links = evaluateChain(graph, fullChain(puzzle, words))
  const key = bridgeKey(graph, words)
  const sameResult = (attempt: Attempt) => attempt.links.every((ok, index) => ok === links[index])
  // A repeat is free, unless the dictionary has gained a phrase since then and the result would differ.
  const previous = record.attempts.findIndex(attempt => bridgeKey(graph, attempt.words) === key && sameResult(attempt))
  if (previous !== -1) {
    return { kind: 'duplicate', attempt: previous, record: { ...record, entries: words, feedback: [...record.attempts[previous].links] } }
  }

  const attempt: Attempt = { words, links }
  return { kind: 'checked', links, record: { ...record, entries: words, attempts: [...record.attempts, attempt], feedback: links } }
}

/**
 * After a phrase is added to the dictionary, re-checks the player's latest submitted bridge for free
 * if it is still on screen. Returns the same record when nothing changes. This can complete the bridge.
 * Finished games are never changed, so a recorded win or loss stays as it was.
 */
export function recheckLatest(puzzle: Puzzle, record: GameRecord, graph: WordGraph = GRAPH): GameRecord {
  const last = record.attempts.at(-1)
  if (!last || gameStatus(record) !== 'playing') return record
  const current = record.entries.map(normalizeEntry)
  if (bridgeKey(graph, current) !== bridgeKey(graph, last.words)) return record
  const links = evaluateChain(graph, fullChain(puzzle, last.words))
  if (links.every((ok, index) => ok === last.links[index])) return record
  const updated: Attempt = { words: last.words, links }
  return { ...record, attempts: [...record.attempts.slice(0, -1), updated], feedback: links }
}

/** The player's entries as graph words; '' where a gap is empty or not a single word. */
function playerWords(record: GameRecord, graph: WordGraph): string[] {
  return record.entries.map(entry => {
    const word = normalizeEntry(entry)
    return isSingleWord(word) ? canonicalWord(graph, word) : ''
  })
}

/**
 * The valid bridge that agrees with the most of the player's current entries while
 * keeping every revealed hint. Ties prefer the canonical solution, then alphabetical order.
 * Returns null only if the hints cannot be completed (which the hint logic never allows).
 */
export function bestPath(puzzle: Puzzle, record: GameRecord, graph: WordGraph = GRAPH): string[] | null {
  const fixed: (string | null)[] = Array.from({ length: puzzle.gaps }, () => null)
  for (const hint of record.hints) fixed[hint.gap] = hint.word
  const paths = findPaths(graph, puzzle.start, puzzle.end, puzzle.gaps, fixed)
  const player = playerWords(record, graph)
  const canonical = puzzle.solution.join(' ')
  let best: string[] | null = null
  let bestScore = -1
  for (const path of paths) {
    const score = path.reduce((total, word, gap) => total + (player[gap] === word ? 1 : 0), 0)
    if (score > bestScore || (score === bestScore && path.join(' ') === canonical)) {
      best = path
      bestScore = score
    }
  }
  return best
}

export type HintResult =
  | { readonly kind: 'unavailable' }
  | {
      readonly kind: 'hint'
      readonly record: GameRecord
      readonly gap: number
      readonly word: string
      /** What the player had typed in that gap ('' if empty). */
      readonly replaced: string
      /** Number of the player's other filled gaps that do not fit the bridge this hint came from. */
      readonly conflicts: number
      /** Number of the player's other filled, unrevealed gaps. */
      readonly othersFilled: number
    }

/**
 * Reveals one gap and fixes it in place. The word comes from a valid bridge that keeps all
 * earlier hints and agrees with as many of the player's entries as possible, so the puzzle
 * always remains solvable. Prefers revealing a gap the player has not already got right.
 */
export function takeHint(puzzle: Puzzle, record: GameRecord, graph: WordGraph = GRAPH): HintResult {
  if (gameStatus(record) !== 'playing' || hintsLeft(puzzle, record) <= 0) return { kind: 'unavailable' }
  const path = bestPath(puzzle, record, graph)
  if (!path) return { kind: 'unavailable' }

  const player = playerWords(record, graph)
  const open = path.flatMap((_, gap) => (isHinted(record, gap) ? [] : [gap]))
  const gap = open.find(index => player[index] !== path[index]) ?? open[0]
  if (gap === undefined) return { kind: 'unavailable' }
  const word = path[gap]
  const replaced = normalizeEntry(record.entries[gap])

  const updated = replaceEntry(record, gap, word)
  const others = open.filter(index => index !== gap && player[index] !== '')
  return {
    kind: 'hint',
    record: { ...updated, hints: [...record.hints, { gap, word }] },
    gap,
    word,
    replaced,
    conflicts: others.filter(index => player[index] !== path[index]).length,
    othersFilled: others.length,
  }
}

/** A valid bridge to show after a loss: consistent with every revealed hint, close to the player's last try. */
export function revealSolution(puzzle: Puzzle, record: GameRecord, graph: WordGraph = GRAPH): string[] {
  return bestPath(puzzle, record, graph) ?? [...puzzle.solution]
}
