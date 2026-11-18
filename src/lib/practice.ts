import type { Puzzle } from '../data/puzzles.ts'
import { PRACTICE_MEMORY } from './storage.ts'

/**
 * Picks a practice puzzle. Never picks anything in `avoid` (today's daily puzzle and the
 * current practice puzzle) when there is a choice, and avoids the recently played list
 * until it would leave nothing to choose from.
 */
export function pickPractice(
  puzzles: readonly Puzzle[],
  avoid: ReadonlySet<string>,
  recent: readonly string[],
  random: () => number = Math.random,
): Puzzle {
  const recentSet = new Set(recent.slice(-PRACTICE_MEMORY))
  const allowed = puzzles.filter(puzzle => !avoid.has(puzzle.id))
  const fresh = allowed.filter(puzzle => !recentSet.has(puzzle.id))
  let choices = fresh
  if (choices.length === 0) {
    // Everything has been played recently: choose among the least recently played half.
    const order = new Map(recent.map((id, index) => [id, index]))
    const sorted = [...allowed].sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1))
    choices = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)))
  }
  if (choices.length === 0) choices = [...puzzles]
  const index = Math.min(choices.length - 1, Math.floor(random() * choices.length))
  return choices[index]
}

export function rememberPractice(recent: readonly string[], id: string): string[] {
  return [...recent.filter(item => item !== id), id].slice(-PRACTICE_MEMORY)
}
