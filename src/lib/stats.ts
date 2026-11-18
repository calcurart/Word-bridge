import { gameStatus, MAX_CHECKS } from './game.ts'
import type { GameRecord } from './game.ts'

export type DailyStats = {
  readonly played: number
  readonly wins: number
  /** Whole percent, 0 when nothing has been played. */
  readonly winRate: number
  readonly currentStreak: number
  readonly bestStreak: number
  /** distribution[i]: wins that took i + 1 checks. */
  readonly distribution: readonly number[]
}

/**
 * Statistics are derived from the per-day game records rather than kept as counters.
 * Each UTC day has at most one record, and a finished record cannot change, so a
 * result is counted exactly once no matter how often the page is reloaded.
 *
 * A streak is a run of wins on consecutive daily puzzles. A loss or a missed day
 * breaks it, but an unfinished puzzle for `today` does not end yesterday's streak.
 */
export function dailyStats(daily: Readonly<Record<string, GameRecord>>, today: number): DailyStats {
  const results = new Map<number, boolean>()
  const distribution = Array.from({ length: MAX_CHECKS }, () => 0)
  for (const [key, record] of Object.entries(daily)) {
    const status = gameStatus(record)
    if (status === 'playing') continue
    results.set(Number(key), status === 'won')
    if (status === 'won') distribution[record.attempts.length - 1]++
  }

  const played = results.size
  const wins = [...results.values()].filter(Boolean).length

  let bestStreak = 0
  let run = 0
  let previous = Number.NaN
  for (const day of [...results.keys()].sort((a, b) => a - b)) {
    const won = results.get(day) === true
    run = won ? (day === previous + 1 ? run + 1 : 1) : 0
    bestStreak = Math.max(bestStreak, run)
    previous = won ? day : Number.NaN
  }

  let currentStreak = 0
  let day = results.has(today) ? today : today - 1
  while (results.get(day) === true) {
    currentStreak++
    day--
  }

  return {
    played,
    wins,
    winRate: played === 0 ? 0 : Math.round((wins / played) * 100),
    currentStreak,
    bestStreak,
    distribution,
  }
}
