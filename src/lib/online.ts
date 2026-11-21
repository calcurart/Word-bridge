// Global counts, challenge scores and the leaderboard, via the same service as phrase suggestions.
// Every call fails quietly (returns null/false) so the game keeps working offline.
import { COMMUNITY_API, request } from './community.ts'

export const ONLINE = COMMUNITY_API !== ''

async function post(path: string, body: unknown): Promise<Record<string, unknown> | null> {
  if (!ONLINE) return null
  try {
    const response = await request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const value: unknown = await response.json()
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export type GameReport = {
  player: string
  name?: string
  gameId: string
  mode: 'daily' | 'practice'
  won: boolean
  checks: number
  hints: number
}

/** True once the server has the game (newly counted or counted before). */
export async function reportGame(report: GameReport): Promise<boolean> {
  const body = await post('/games', report)
  return body?.status === 'counted' || body?.status === 'already-counted'
}

export async function startChallenge(player: string, name?: string): Promise<string | null> {
  const body = await post('/challenge/start', name ? { player, name } : { player })
  return typeof body?.run === 'string' ? body.run : null
}

export type ChallengeResult =
  | { status: 'scored'; score: number; best: number; rankToday: number; rankAllTime: number }
  | { status: 'too-late' | 'error' }

export async function finishChallenge(player: string, run: string, answers: readonly (readonly [string, string])[]): Promise<ChallengeResult> {
  const body = await post('/challenge/finish', { player, run, answers })
  if (body?.status === 'scored' && typeof body.score === 'number') {
    return {
      status: 'scored',
      score: body.score,
      best: Number(body.best) || body.score,
      rankToday: Number(body.rankToday) || 0,
      rankAllTime: Number(body.rankAllTime) || 0,
    }
  }
  return { status: body?.status === 'too-late' ? 'too-late' : 'error' }
}

export type PlayerUpdate = 'saved' | 'name-rejected' | 'error'

export async function savePlayer(player: string, changes: { name?: string; hidden?: boolean }): Promise<PlayerUpdate> {
  const body = await post('/player', { player, ...changes })
  return body?.status === 'saved' ? 'saved' : body?.status === 'name-rejected' ? 'name-rejected' : 'error'
}

export type BoardRow = { name: string; value: number; wins?: number }
export type Leaderboard = {
  totals: { games: number; wins: number; players: number; runs: number; connections: number }
  challengeToday: BoardRow[]
  challengeAllTime: BoardRow[]
  mostBridges: BoardRow[]
  you: { name: string; hidden: boolean; games: number; wins: number; best: number; rankBridges: number | null; rankChallenge: number | null } | null
}

export async function fetchLeaderboard(player: string): Promise<Leaderboard | null> {
  if (!ONLINE) return null
  try {
    const response = await request(`/leaderboard${player ? `?player=${encodeURIComponent(player)}` : ''}`)
    if (!response.ok) return null
    const body = (await response.json()) as Leaderboard & { status?: string }
    return body.status === 'ok' ? body : null
  } catch {
    return null
  }
}

/** The name shown until the player picks one; the server uses the same rule. */
export function defaultName(player: string): string {
  return `Bridge Builder ${player.slice(0, 4).toUpperCase()}`
}
