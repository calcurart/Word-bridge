// Global counts, challenge scores and the leaderboard, via the same service as phrase suggestions.
// Every call fails quietly (returns null/false) so the game keeps working offline.
import type { ChallengeMode } from './challenge.ts'
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

/** Where a run stands after a move: the prompt to show next, or done when the last round is over. */
export type RoundState = { prompt: string; round: number; endsIn: number; score: number; done: boolean }
export type ChallengeStart = { run: string; prompt: string; round: number; rounds: number; endsIn: number }

export async function startChallenge(player: string, mode: ChallengeMode, name?: string): Promise<ChallengeStart | null> {
  const body = await post('/challenge/start', name ? { player, mode, name } : { player, mode })
  if (typeof body?.run !== 'string' || typeof body.prompt !== 'string') return null
  return { run: body.run, prompt: body.prompt, round: Number(body.round) || 1, rounds: Number(body.rounds) || 10, endsIn: Number(body.endsIn) || 0 }
}

const roundState = (body: Record<string, unknown>): RoundState => ({
  prompt: String(body.prompt ?? ''),
  round: Number(body.round) || 1,
  endsIn: Number(body.endsIn) || 0,
  score: Number(body.score) || 0,
  done: body.done === true,
})

export type AnswerResult = { slot: 'before' | 'after'; word: string; phrase: string; points: number; source: string; players: number }
export type AnswerReason = 'missing' | 'not-one-word' | 'not-a-word' | 'same' | 'used' | 'same-pair' | 'unknown' | 'error'
export type AnswerOutcome =
  | ({ ok: true; results: AnswerResult[]; gained: number } & RoundState)
  | ({ ok: false; reason: 'time' } & RoundState)
  | { ok: false; reason: AnswerReason; slot?: 'before' | 'after'; endsIn?: number }

export async function answerChallenge(player: string, run: string, words: { before?: string; after: string }): Promise<AnswerOutcome> {
  const body = await post('/challenge/answer', { player, run, ...words })
  if (body?.ok === true && Array.isArray(body.results)) {
    return { ok: true, results: body.results as AnswerResult[], gained: Number(body.gained) || 0, ...roundState(body) }
  }
  if (body?.reason === 'time' || body?.reason === 'over') return { ok: false, reason: 'time', ...roundState({ ...body, done: body.done ?? body.reason === 'over' }) }
  const reasons: AnswerReason[] = ['missing', 'not-one-word', 'not-a-word', 'same', 'used', 'same-pair', 'unknown']
  const reason = reasons.find(item => item === body?.reason) ?? 'error'
  const slot = body?.slot === 'before' || body?.slot === 'after' ? body.slot : undefined
  return { ok: false, reason, ...(slot ? { slot } : {}), ...(typeof body?.endsIn === 'number' ? { endsIn: body.endsIn } : {}) }
}

/** Moves on to the next prompt: the Skip button, or the time bar running out. */
export async function skipChallenge(player: string, run: string): Promise<RoundState | null> {
  const body = await post('/challenge/skip', { player, run })
  return body && typeof body.prompt === 'string' ? roundState(body) : null
}

export type ChallengeResult =
  | { status: 'scored'; score: number; best: number; rankToday: number; rankAllTime: number }
  | { status: 'error' }

export async function finishChallenge(player: string, run: string): Promise<ChallengeResult> {
  const body = await post('/challenge/finish', { player, run })
  if (body?.status === 'scored' && typeof body.score === 'number') {
    return { status: 'scored', score: body.score, best: Number(body.best) || body.score, rankToday: Number(body.rankToday) || 0, rankAllTime: Number(body.rankAllTime) || 0 }
  }
  return { status: 'error' }
}

export type PlayerUpdate = 'saved' | 'name-rejected' | 'error'

export async function savePlayer(player: string, changes: { name?: string; hidden?: boolean }): Promise<PlayerUpdate> {
  const body = await post('/player', { player, ...changes })
  return body?.status === 'saved' ? 'saved' : body?.status === 'name-rejected' ? 'name-rejected' : 'error'
}

export type BoardRow = { name: string; value: number; wins?: number }
export type Leaderboard = {
  totals: { games: number; wins: number; players: number; runs: number; answers: number }
  single: { today: BoardRow[]; allTime: BoardRow[] }
  double: { today: BoardRow[]; allTime: BoardRow[] }
  mostBridges: BoardRow[]
  you: {
    name: string; hidden: boolean; games: number; wins: number; bestSingle: number; bestDouble: number
    rankBridges: number | null; rankSingle: number | null; rankDouble: number | null
  } | null
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
