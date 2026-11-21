// Input checks for the leaderboard API. Pure functions, so they can be tested without a server.
import { MAX_CHECKS } from '../../src/lib/game.ts'

import { GAME_ID, PLAYER_ID } from '../../src/lib/ids.ts'

export { GAME_ID, PLAYER_ID }
export const NAME_MAX = 20

// Names are public, so anything containing these is refused. Matched inside words as well.
const NAME_BLOCK = [
  'fuck', 'shit', 'cunt', 'nigg', 'fagg', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'bitch', 'dick', 'cock',
  'porn', 'penis', 'vagina', 'pussy', 'twat', 'wank', 'retard', 'kike', 'spic', 'chink', 'tranny',
]

/** Tidies a display name and returns it, or null when it isn't allowed. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > NAME_MAX) return null
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '._-]*$/u.test(name)) return null
  const squashed = name.toLowerCase().replace(/[^a-z]/g, '').replace(/0/g, 'o')
  if (NAME_BLOCK.some(word => squashed.includes(word))) return null
  return name
}

export type GameReport = {
  readonly player: string
  readonly gameId: string
  readonly mode: 'daily' | 'practice'
  readonly won: boolean
  readonly checks: number
  readonly hints: number
}

/** Validates a "game finished" report from the browser. Returns null for anything malformed. */
export function parseGameReport(body: unknown, today: number): GameReport | null {
  if (body === null || typeof body !== 'object') return null
  const value = body as Record<string, unknown>
  const { player, gameId, mode, won, checks, hints } = value
  if (typeof player !== 'string' || !PLAYER_ID.test(player)) return null
  if (typeof gameId !== 'string' || !GAME_ID.test(gameId)) return null
  if (mode !== 'daily' && mode !== 'practice') return null
  if (mode === 'daily' !== gameId.startsWith('daily-')) return null
  if (mode === 'daily' && Number(gameId.slice(6)) > today + 1) return null
  if (typeof won !== 'boolean') return null
  if (!Number.isInteger(checks) || (checks as number) < 1 || (checks as number) > MAX_CHECKS) return null
  if (!won && checks !== MAX_CHECKS) return null
  if (!Number.isInteger(hints) || (hints as number) < 0 || (hints as number) > 2) return null
  return { player, gameId, mode, won, checks: checks as number, hints: hints as number }
}

/** Reads the (prompt, answer) pairs of a challenge run, dropping anything that isn't two short strings. */
export function parseAnswers(raw: unknown, max: number): [string, string][] | null {
  if (!Array.isArray(raw) || raw.length > max) return null
  const pairs: [string, string][] = []
  for (const item of raw) {
    if (!Array.isArray(item) || item.length !== 2) return null
    const [prompt, answer] = item
    if (typeof prompt !== 'string' || typeof answer !== 'string' || prompt.length > 24 || answer.length > 24) return null
    pairs.push([prompt, answer])
  }
  return pairs
}
