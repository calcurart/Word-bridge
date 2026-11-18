import { gameStatus, MAX_CHECKS } from './game.ts'
import type { GameRecord } from './game.ts'

export type ShareLabel = { readonly mode: 'daily'; readonly number: number } | { readonly mode: 'practice' }

export function hintCount(count: number): string {
  return count === 0 ? 'no hints' : count === 1 ? '1 hint' : `${count} hints`
}

/**
 * A spoiler-free summary: one row per submitted bridge, one square per link.
 * It never contains the endpoints, the entered words, the phrases or a solution.
 */
export function shareText(record: GameRecord, label: ShareLabel): string {
  const header = label.mode === 'daily' ? `Word Bridge #${label.number}` : 'Word Bridge · Practice'
  const won = gameStatus(record) === 'won'
  const hints = hintCount(record.hints.length)
  const summary = won
    ? `Solved in ${record.attempts.length}/${MAX_CHECKS} checks · ${hints}`
    : `X/${MAX_CHECKS} checks · ${hints}`
  const rows = record.attempts.map(attempt => attempt.links.map(ok => (ok ? '🟩' : '⬜')).join(''))
  return [header, summary, ...rows].join('\n')
}
