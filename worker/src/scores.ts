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
import { cleanName, parseGameReport, PLAYER_ID } from './leaderboard.ts'
import type { D1Database } from './types.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const GAMES_PER_IP_HOUR = 120
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

async function recentCount(ctx: Context, table: 'games', column: string): Promise<number> {
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
            (SELECT COUNT(*) FROM players WHERE games > 0 OR best_single > 0 OR best_double > 0) AS players,
            (SELECT COUNT(*) FROM runs WHERE finished_at IS NOT NULL) AS runs,
            (SELECT COALESCE(SUM(answers), 0) FROM runs) AS answers`,
  ).first<{ games: number; wins: number; players: number; runs: number; answers: number }>()

  const board = async (mode: 'single' | 'double') => {
    const column = mode === 'single' ? 'best_single' : 'best_double'
    const today = await ctx.db.prepare(
      `SELECT p.name AS name, MAX(r.score) AS value FROM runs r JOIN players p ON p.id = r.player_id
       WHERE r.mode = ? AND r.finished_at >= ? AND r.score > 0 AND p.hidden = 0 GROUP BY r.player_id ORDER BY value DESC, MIN(r.finished_at) LIMIT ?`,
    ).bind(mode, since, TOP).all<Row>()
    const allTime = await ctx.db.prepare(
      `SELECT name, ${column} AS value FROM players WHERE hidden = 0 AND ${column} > 0 ORDER BY value DESC, updated_at LIMIT ?`,
    ).bind(TOP).all<Row>()
    return { today: today.results, allTime: allTime.results }
  }
  const mostBridges = await ctx.db.prepare(
    'SELECT name, games AS value, wins FROM players WHERE hidden = 0 AND games > 0 ORDER BY games DESC, wins DESC, created_at LIMIT ?',
  ).bind(TOP).all<Row>()

  let you: Record<string, unknown> | null = null
  const player = url.searchParams.get('player')
  if (player && PLAYER_ID.test(player)) {
    const me = await ctx.db.prepare('SELECT name, hidden, games, wins, best_single, best_double FROM players WHERE id = ?')
      .bind(player).first<{ name: string; hidden: number; games: number; wins: number; best_single: number; best_double: number }>()
    if (me) {
      const ahead = async (column: string, value: number) =>
        value > 0 ? 1 + ((await ctx.db.prepare(`SELECT COUNT(*) AS n FROM players WHERE hidden = 0 AND ${column} > ?`).bind(value).first<{ n: number }>())?.n ?? 0) : null
      you = {
        name: me.name,
        hidden: me.hidden === 1,
        games: me.games,
        wins: me.wins,
        bestSingle: me.best_single,
        bestDouble: me.best_double,
        rankBridges: await ahead('games', me.games),
        rankSingle: await ahead('best_single', me.best_single),
        rankDouble: await ahead('best_double', me.best_double),
      }
    }
  }

  return ctx.json({
    status: 'ok',
    totals: totals ?? { games: 0, wins: 0, players: 0, runs: 0, answers: 0 },
    single: await board('single'),
    double: await board('double'),
    mostBridges: mostBridges.results,
    you,
  })
}

export type { Context }
