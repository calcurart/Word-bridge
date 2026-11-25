// "How others crossed" for a daily puzzle.
//
//   POST /crossings  { player, day, bridge? }  -> { status: 'ok', finished, solvers, distinct, routes, yours }
//                                              -> { status: 'not-finished' } until the player's game is counted
//
// A player who has finished the daily (their game is in `games`, see scores.ts) sends their winning bridge
// and gets back how everyone crossed. Only players who finished get the breakdown, so it never spoils a
// puzzle in progress. A bridge is stored once per player and day, and only if every link is in the game's
// dictionary (built-in phrases plus verified suggestions), so made-up or offensive routes are never shown.
import { isValidBridge, parseCrossingRequest, summarizeCrossings } from '../../src/lib/crossings.ts'
import { buildGraph, dictionarySources } from '../../src/lib/graph.ts'
import { readBody } from './scores.ts'
import type { Context } from './scores.ts'

const DAY = 86_400_000

export async function crossings(request: Request, ctx: Context): Promise<Response> {
  const parsed = parseCrossingRequest(await readBody(request), Math.floor(ctx.now / DAY))
  if (!parsed) return ctx.json({ status: 'invalid' }, 400)
  const gameId = `daily-${parsed.day}`

  const game = await ctx.db.prepare('SELECT won, bridge FROM games WHERE player_id = ? AND game_id = ?')
    .bind(parsed.player, gameId).first<{ won: number; bridge: string | null }>()
  if (!game) return ctx.json({ status: 'not-finished' })

  let yours = game.bridge
  if (yours === null && game.won === 1 && parsed.bridge && (await bridgeExists(ctx, parsed.day, parsed.bridge))) {
    yours = parsed.bridge.join(' ')
    await ctx.db.prepare('UPDATE games SET bridge = ? WHERE player_id = ? AND game_id = ? AND bridge IS NULL')
      .bind(yours, parsed.player, gameId).run()
  }

  const rows = await ctx.db.prepare(
    'SELECT bridge, COUNT(*) AS count FROM games WHERE game_id = ? AND bridge IS NOT NULL GROUP BY bridge',
  ).bind(gameId).all<{ bridge: string; count: number }>()
  const finished = await ctx.db.prepare('SELECT COUNT(*) AS n FROM games WHERE game_id = ?').bind(gameId).first<{ n: number }>()
  return ctx.json({ status: 'ok', ...summarizeCrossings(rows.results, finished?.n ?? 0, yours) })
}

/**
 * Checks the bridge against the bundled dictionary first. Only if that misses a link (a phrase suggested
 * since the last nightly sync) is the full list of verified suggestions loaded from the database.
 */
async function bridgeExists(ctx: Context, day: number, words: readonly string[]): Promise<boolean> {
  if (isValidBridge(day, words)) return true
  const added = await ctx.db.prepare('SELECT source FROM links').all<{ source: string }>()
  return isValidBridge(day, words, buildGraph(dictionarySources(added.results.map(row => row.source))))
}
