// "How others crossed": the winning routes players took across a daily puzzle.
// Shared by the game (labels) and the server (checking and summarising bridges), so both agree.
import { PUZZLE_BY_ID } from '../data/puzzles.ts'
import { MAX_ENTRY_LENGTH } from './game.ts'
import { canonicalWord, evaluateChain, GRAPH, normalizeEntry } from './graph.ts'
import type { WordGraph } from './graph.ts'
import { PLAYER_ID } from './ids.ts'
import { dailyForDay, FIRST_DAY } from './schedule.ts'

/** How many of the most popular routes are listed. */
export const TOP_ROUTES = 5

export type Route = { readonly words: readonly string[]; readonly count: number }
export type Crossings = {
  /** Players who finished this daily, won or lost. */
  readonly finished: number
  /** Players who won it and whose bridge is known. Percentages are out of this. */
  readonly solvers: number
  /** Different routes among those bridges. */
  readonly distinct: number
  readonly routes: readonly Route[]
  /** The asking player's own route, with its popularity rank (1 = most taken), or null. */
  readonly yours: (Route & { readonly rank: number }) | null
}

export type CrossingRequest = { readonly player: string; readonly day: number; readonly bridge: readonly string[] | null }

const WORD = /^[a-z]+$/

/**
 * Reads a request from the browser. `day` must be a daily that exists (up to one day ahead, for clocks
 * that run fast). A bridge that is malformed is dropped (null) rather than failing the whole request.
 */
export function parseCrossingRequest(body: unknown, today: number): CrossingRequest | null {
  if (body === null || typeof body !== 'object') return null
  const { player, day, bridge } = body as Record<string, unknown>
  if (typeof player !== 'string' || !PLAYER_ID.test(player)) return null
  if (typeof day !== 'number' || !Number.isInteger(day) || day < FIRST_DAY || day > today + 1) return null
  return { player, day, bridge: parseBridge(bridge, day) }
}

/** The gap words of a bridge in dictionary spelling, or null if it isn't the right shape for that day's puzzle. */
export function parseBridge(raw: unknown, day: number, graph: WordGraph = GRAPH): string[] | null {
  const puzzle = PUZZLE_BY_ID.get(dailyForDay(day).puzzleId)
  if (!puzzle || !Array.isArray(raw) || raw.length !== puzzle.gaps) return null
  const words: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || item.length > MAX_ENTRY_LENGTH) return null
    const word = normalizeEntry(item)
    if (!WORD.test(word)) return null
    words.push(canonicalWord(graph, word))
  }
  return words
}

/** True when every link of START + words + END is in the dictionary. */
export function isValidBridge(day: number, words: readonly string[], graph: WordGraph = GRAPH): boolean {
  const puzzle = PUZZLE_BY_ID.get(dailyForDay(day).puzzleId)
  if (!puzzle || words.length !== puzzle.gaps) return false
  return evaluateChain(graph, [puzzle.start, ...words, puzzle.end]).every(Boolean)
}

/** Groups stored bridges ("flower pot") into the most taken routes, plus the asking player's own. */
export function summarizeCrossings(
  rows: readonly { readonly bridge: string; readonly count: number }[],
  finished: number,
  yours: string | null,
  top = TOP_ROUTES,
): Crossings {
  const sorted = [...rows]
    .filter(row => row.bridge !== '' && row.count > 0)
    .sort((a, b) => b.count - a.count || a.bridge.localeCompare(b.bridge))
  const toRoute = (row: { bridge: string; count: number }): Route => ({ words: row.bridge.split(' '), count: row.count })
  const solvers = sorted.reduce((total, row) => total + row.count, 0)
  const mine = yours === null ? undefined : sorted.find(row => row.bridge === yours)
  return {
    finished: Math.max(finished, solvers),
    solvers,
    distinct: sorted.length,
    routes: sorted.slice(0, top).map(toRoute),
    yours: mine ? { ...toRoute(mine), rank: 1 + sorted.filter(row => row.count > mine.count).length } : null,
  }
}

/** Share of solvers as a whole percentage. Never shows 0% for a route someone took. */
export function routeShare(count: number, solvers: number): string {
  if (solvers <= 0) return '0%'
  const percent = Math.round((100 * count) / solvers)
  return percent === 0 ? '<1%' : `${percent}%`
}

export const sameRoute = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((word, index) => word === b[index])

/** The one-line verdict on the player's own route. */
export function yourRouteVerdict(crossings: Crossings): { readonly tone: 'rare' | 'popular' | 'plain'; readonly text: string } | null {
  const { yours, solvers, distinct } = crossings
  if (!yours) return null
  if (solvers === 1) return { tone: 'rare', text: 'You’re the first across. Check back later to see how others cross.' }
  if (yours.count === 1) return { tone: 'rare', text: 'Nobody else has crossed your way. So far it’s yours alone.' }
  const share = routeShare(yours.count, solvers)
  if (yours.rank === 1 && distinct > 1) return { tone: 'popular', text: `You took the most popular route: ${share} of builders crossed this way.` }
  if (distinct === 1) return { tone: 'popular', text: 'Everyone so far has crossed the same way you did.' }
  if (yours.count / solvers <= 0.1) return { tone: 'rare', text: `A rare route: only ${share} of builders crossed your way.` }
  return { tone: 'plain', text: `${share} of builders crossed your way.` }
}
