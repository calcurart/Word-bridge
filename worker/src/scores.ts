// Global game counts, challenge runs and the leaderboard.
//
//   POST /games              { player, gameId, mode, won, checks, hints, name? }  a finished daily/practice game (counted once)
//   POST /challenge/start    { player, name? }                                    -> { run }
//   POST /challenge/finish   { player, run, answers: [[prompt, answer], ...] }    -> { score, best, rankToday, rankAllTime }
//   POST /player             { player, name?, hidden? }                           change display name / visibility
//   GET  /leaderboard?player=ID                                                   totals, top lists and "you"
//
// Players are anonymous: a random ID kept in their browser plus a display name they can change.
// Scores are re-checked here: challenge answers against the same dictionary the game uses (built-in
// phrases plus verified suggestions), and against a server-side five-minute clock.
import { CHALLENGE_SECONDS, MAX_ANSWERS, scoreAnswers } from '../../src/lib/challenge.ts'
import { buildGraph, dictionarySources } from '../../src/lib/graph.ts'
import { cleanName, parseAnswers, parseGameReport, PLAYER_ID } from './leaderboard.ts'
import type { D1Database } from './types.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const GRACE_MS = 20_000
const GAMES_PER_IP_HOUR = 120
const RUNS_PER_IP_HOUR = 30
const TOP = 20

type Json = (body: unknown, status?: number) => Response
type Context = { db: D1Database; ipHash: string; now: number; json: Json }

const todayStart = (now: number) => Math.floor(now / DAY) * DAY

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Makes sure the player has a row, and applies a new display name if one was sent and is allowed. */
async function upsertPlayer(ctx: Context, player: string, rawName: unknown): Promise<void> {
  const name = rawName === undefined ? null : cleanName(rawName)
  await ctx.db.prepare(
    `INSERT INTO players (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = COALESCE(?, players.name), updated_at = excluded.updated_at`,
  ).bind(player, name ?? `Bridge Builder ${player.slice(0, 4).toUpperCase()}`, ctx.now, ctx.now, name).run()
}

async function recentCount(ctx: Context, table: 'games' | 'challenge_runs', column: string): Promise<number> {
  const row = await ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ip_hash = ? AND ${column} > ?`)
    .bind(ctx.ipHash, ctx.now - HOUR).first<{ n: number }>()
  return row?.n ?? 0
}

export async function reportGame(request: Request, ctx: Context): Promise<Response> {
  const body = await readBody(request)
  const report = parseGameReport(body, Math.floor(ctx.now / DAY))
  if (!report) return ctx.json({ status: 'invalid' }, 400)
  if ((await recentCount(ctx, 'games', 'created_at')) >= GAMES_PER_IP_HOUR) return ctx.json({ status: 'rate-limited' }, 429)
  await upsertPlayer(ctx, report.player, body?.name)
  const inserted = await ctx.db.prepare(
    `INSERT OR IGNORE INTO games (player_id, game_id, mode, won, checks, hints, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(report.player, report.gameId, report.mode, report.won ? 1 : 0, report.checks, report.hints, ctx.ipHash, ctx.now).run() as { meta?: { changes?: number } }
  const counted = (inserted.meta?.changes ?? 0) > 0
  if (counted) {
    await ctx.db.prepare('UPDATE players SET games = games + 1, wins = wins + ?, updated_at = ? WHERE id = ?')
      .bind(report.won ? 1 : 0, ctx.now, report.player).run()
  }
  return ctx.json({ status: counted ? 'counted' : 'already-counted' })
}

export async function startRun(request: Request, ctx: Context): Promise<Response> {
  const body = await readBody(request)
  const player = body?.player
  if (typeof player !== 'string' || !PLAYER_ID.test(player)) return ctx.json({ status: 'invalid' }, 400)
  if ((await recentCount(ctx, 'challenge_runs', 'started_at')) >= RUNS_PER_IP_HOUR) return ctx.json({ status: 'rate-limited' }, 429)
  await upsertPlayer(ctx, player, body?.name)
  const run = crypto.randomUUID()
  await ctx.db.prepare('INSERT INTO challenge_runs (id, player_id, started_at, ip_hash) VALUES (?, ?, ?, ?)')
    .bind(run, player, ctx.now, ctx.ipHash).run()
  return ctx.json({ status: 'started', run, seconds: CHALLENGE_SECONDS })
}

export async function finishRun(request: Request, ctx: Context): Promise<Response> {
  const body = await readBody(request)
  const player = body?.player
  const run = body?.run
  const pairs = parseAnswers(body?.answers, MAX_ANSWERS)
  if (typeof player !== 'string' || !PLAYER_ID.test(player) || typeof run !== 'string' || !pairs) return ctx.json({ status: 'invalid' }, 400)

  const row = await ctx.db.prepare('SELECT started_at, finished_at FROM challenge_runs WHERE id = ? AND player_id = ?')
    .bind(run, player).first<{ started_at: number; finished_at: number | null }>()
  if (!row) return ctx.json({ status: 'invalid' }, 404)
  if (row.finished_at !== null) return ctx.json({ status: 'already-finished' }, 409)
  if (ctx.now - row.started_at > CHALLENGE_SECONDS * 1000 + GRACE_MS) {
    await ctx.db.prepare('UPDATE challenge_runs SET finished_at = ?, score = 0 WHERE id = ?').bind(ctx.now, run).run()
    return ctx.json({ status: 'too-late' }, 409)
  }

  // Score with the same dictionary as the game, including every verified player suggestion so far.
  const community = await ctx.db.prepare('SELECT source FROM links').all<{ source: string }>()
  const graph = buildGraph(dictionarySources(community.results.map(item => item.source)))
  const score = scoreAnswers(graph, pairs)

  await ctx.db.prepare('UPDATE challenge_runs SET finished_at = ?, score = ? WHERE id = ?').bind(ctx.now, score, run).run()
  await ctx.db.prepare('UPDATE players SET best_challenge = MAX(best_challenge, ?), updated_at = ? WHERE id = ?')
    .bind(score, ctx.now, player).run()
  const best = (await ctx.db.prepare('SELECT best_challenge AS b FROM players WHERE id = ?').bind(player).first<{ b: number }>())?.b ?? score
  const rankAllTime = 1 + ((await ctx.db.prepare('SELECT COUNT(*) AS n FROM players WHERE hidden = 0 AND best_challenge > ?').bind(best).first<{ n: number }>())?.n ?? 0)
  const rankToday = 1 + ((await ctx.db.prepare(
    `SELECT COUNT(*) AS n FROM (SELECT r.player_id, MAX(r.score) AS s FROM challenge_runs r JOIN players p ON p.id = r.player_id
     WHERE r.finished_at >= ? AND p.hidden = 0 AND r.player_id != ? GROUP BY r.player_id) WHERE s > ?`,
  ).bind(todayStart(ctx.now), player, score).first<{ n: number }>())?.n ?? 0)
  return ctx.json({ status: 'scored', score, best, rankToday, rankAllTime })
}

export async function updatePlayer(request: Request, ctx: Context): Promise<Response> {
  const body = await readBody(request)
  const player = body?.player
  if (typeof player !== 'string' || !PLAYER_ID.test(player)) return ctx.json({ status: 'invalid' }, 400)
  if (body?.name !== undefined && cleanName(body.name) === null) return ctx.json({ status: 'name-rejected' }, 400)
  await upsertPlayer(ctx, player, body?.name)
  if (typeof body?.hidden === 'boolean') {
    await ctx.db.prepare('UPDATE players SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, player).run()
  }
  return ctx.json({ status: 'saved' })
}

type Row = { name: string; value: number; wins?: number }

export async function leaderboard(url: URL, ctx: Context): Promise<Response> {
  const since = todayStart(ctx.now)
  const totals = await ctx.db.prepare(
    `SELECT (SELECT COUNT(*) FROM games) AS games, (SELECT COALESCE(SUM(won), 0) FROM games) AS wins,
            (SELECT COUNT(*) FROM players WHERE games > 0 OR best_challenge > 0) AS players,
            (SELECT COUNT(*) FROM challenge_runs WHERE score IS NOT NULL) AS runs,
            (SELECT COALESCE(SUM(score), 0) FROM challenge_runs WHERE score IS NOT NULL) AS connections`,
  ).first<{ games: number; wins: number; players: number; runs: number; connections: number }>()

  const challengeToday = await ctx.db.prepare(
    `SELECT p.name AS name, MAX(r.score) AS value FROM challenge_runs r JOIN players p ON p.id = r.player_id
     WHERE r.finished_at >= ? AND r.score > 0 AND p.hidden = 0 GROUP BY r.player_id ORDER BY value DESC, MIN(r.finished_at) LIMIT ?`,
  ).bind(since, TOP).all<Row>()
  const challengeAllTime = await ctx.db.prepare(
    'SELECT name, best_challenge AS value FROM players WHERE hidden = 0 AND best_challenge > 0 ORDER BY value DESC, updated_at LIMIT ?',
  ).bind(TOP).all<Row>()
  const mostBridges = await ctx.db.prepare(
    'SELECT name, games AS value, wins FROM players WHERE hidden = 0 AND games > 0 ORDER BY games DESC, wins DESC, created_at LIMIT ?',
  ).bind(TOP).all<Row>()

  let you: Record<string, unknown> | null = null
  const player = url.searchParams.get('player')
  if (player && PLAYER_ID.test(player)) {
    const me = await ctx.db.prepare('SELECT name, hidden, games, wins, best_challenge FROM players WHERE id = ?')
      .bind(player).first<{ name: string; hidden: number; games: number; wins: number; best_challenge: number }>()
    if (me) {
      const ahead = async (sql: string, value: number) => 1 + ((await ctx.db.prepare(sql).bind(value).first<{ n: number }>())?.n ?? 0)
      you = {
        name: me.name,
        hidden: me.hidden === 1,
        games: me.games,
        wins: me.wins,
        best: me.best_challenge,
        rankBridges: me.games > 0 ? await ahead('SELECT COUNT(*) AS n FROM players WHERE hidden = 0 AND games > ?', me.games) : null,
        rankChallenge: me.best_challenge > 0 ? await ahead('SELECT COUNT(*) AS n FROM players WHERE hidden = 0 AND best_challenge > ?', me.best_challenge) : null,
      }
    }
  }

  return ctx.json({
    status: 'ok',
    totals: totals ?? { games: 0, wins: 0, players: 0, runs: 0, connections: 0 },
    challengeToday: challengeToday.results,
    challengeAllTime: challengeAllTime.results,
    mostBridges: mostBridges.results,
    you,
  })
}

export type { Context }
