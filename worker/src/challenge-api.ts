// Challenge runs, played against the server so scores can be trusted. A run is ROUNDS prompts with
// ROUND_SECONDS each; when a prompt's time runs out the run moves on to the next prompt.
//
//   POST /challenge/start   { player, mode: 'single'|'double', name? } -> { run, prompt, round, rounds, endsIn, score }
//   POST /challenge/answer  { player, run, after, before? }            -> { ok: true, results[], gained, score, ...next }
//                                                                          | { ok: false, reason, slot?, endsIn }
//                                                                          | { ok: false, reason: 'time', ...next }  (timed out)
//   POST /challenge/skip    { player, run }                            -> next   (move on; also used when time runs out)
//   POST /challenge/finish  { player, run }                            -> { score, best, rankToday, rankAllTime }
//
// "next" is { prompt, round, endsIn, score, done }. When done is true the run is over and its score is final.
import { ROUND_SECONDS, ROUNDS } from '../../src/lib/challenge.ts'
import {
  checkWords, LIVE_WIKTIONARY_BASE, lookup, nextPrompt, phraseOf, pickPrompt, points, URBAN_BASE,
} from './challenge-engine.ts'
import type { Dictionary, Form, Mode, Slot } from './challenge-engine.ts'
import { cleanName, PLAYER_ID } from './leaderboard.ts'
import type { D1Database } from './types.ts'
import { judgeUrban, urbanUrl } from './urban.ts'
import { judge, parsePages, wiktionaryUrl } from './verify.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Allowance for network delay: an answer sent just before the bar empties still counts. */
const GRACE_MS = 2_000
const RUNS_PER_IP_HOUR = 60
const LOOKUP_CACHE_MS = 30 * DAY
const WIKTIONARY_UA = 'WordBridgePhraseCheck/1.0 (word game phrase checker; Cloudflare Worker)'

export type ChallengeContext = {
  db: D1Database
  ipHash: string
  now: number
  dictionary: Dictionary
  json: (body: unknown, status?: number) => Response
}

type RunRow = {
  id: string; player_id: string; mode: Mode; prompt: string; used: string; score: number; answers: number
  round: number; ends_at: number; finished_at: number | null
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function loadRun(ctx: ChallengeContext, body: Record<string, unknown> | null): Promise<RunRow | null> {
  const player = body?.player
  const run = body?.run
  if (typeof player !== 'string' || !PLAYER_ID.test(player) || typeof run !== 'string' || run.length > 64) return null
  return ctx.db.prepare('SELECT id, player_id, mode, prompt, used, score, answers, round, ends_at, finished_at FROM runs WHERE id = ? AND player_id = ?')
    .bind(run, player).first<RunRow>()
}

export async function startRun(request: Request, ctx: ChallengeContext): Promise<Response> {
  const body = await readBody(request)
  const player = body?.player
  const mode = body?.mode
  if (typeof player !== 'string' || !PLAYER_ID.test(player) || (mode !== 'single' && mode !== 'double')) return ctx.json({ status: 'invalid' }, 400)
  const recent = await ctx.db.prepare('SELECT COUNT(*) AS n FROM runs WHERE ip_hash = ? AND started_at > ?').bind(ctx.ipHash, ctx.now - HOUR).first<{ n: number }>()
  if ((recent?.n ?? 0) >= RUNS_PER_IP_HOUR) return ctx.json({ status: 'rate-limited' }, 429)

  const name = body?.name === undefined ? null : cleanName(body.name)
  await ctx.db.prepare(
    `INSERT INTO players (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = COALESCE(?, players.name), updated_at = excluded.updated_at`,
  ).bind(player, name ?? `Bridge Builder ${player.slice(0, 4).toUpperCase()}`, ctx.now, ctx.now, name).run()

  const prompt = pickPrompt(ctx.dictionary, mode, new Set())
  const run = crypto.randomUUID()
  const endsAt = ctx.now + ROUND_SECONDS * 1000
  await ctx.db.prepare('INSERT INTO runs (id, player_id, mode, prompt, used, score, answers, round, started_at, ends_at, ip_hash) VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?, ?, ?)')
    .bind(run, player, mode, prompt, JSON.stringify([prompt]), ctx.now, endsAt, ctx.ipHash).run()
  return ctx.json({ status: 'started', run, mode, prompt, round: 1, rounds: ROUNDS, endsIn: endsAt - ctx.now, score: 0 })
}

/**
 * Moves the run to its next round: a new prompt with a fresh timer, or the end of the run after the last round.
 * `gained` points (if any) are added; `after` is the word typed after the prompt, used to chain the next prompt.
 */
async function advance(ctx: ChallengeContext, run: RunRow, used: Set<string>, gained: number, after: string | null) {
  const score = run.score + gained
  const answers = run.answers + (after ? 1 : 0)
  if (run.round >= ROUNDS) {
    await ctx.db.prepare('UPDATE runs SET score = ?, answers = ?, used = ?, finished_at = ? WHERE id = ?')
      .bind(score, answers, JSON.stringify([...used]), ctx.now, run.id).run()
    await recordBest(ctx, run.player_id, run.mode, score)
    return { prompt: run.prompt, round: run.round, endsIn: 0, score, done: true }
  }
  const prompt = after ? nextPrompt(ctx.dictionary, run.mode, after, used) : pickPrompt(ctx.dictionary, run.mode, used)
  used.add(prompt)
  const endsAt = ctx.now + ROUND_SECONDS * 1000
  await ctx.db.prepare('UPDATE runs SET score = ?, answers = ?, prompt = ?, used = ?, round = round + 1, ends_at = ? WHERE id = ?')
    .bind(score, answers, prompt, JSON.stringify([...used]), endsAt, run.id).run()
  return { prompt, round: run.round + 1, endsIn: endsAt - ctx.now, score, done: false }
}

async function recordBest(ctx: ChallengeContext, player: string, mode: Mode, score: number) {
  const column = mode === 'single' ? 'best_single' : 'best_double'
  await ctx.db.prepare(`UPDATE players SET ${column} = MAX(${column}, ?), updated_at = ? WHERE id = ?`).bind(score, ctx.now, player).run()
}

type Found = { form: Form; base: number; source: 'dictionary' | 'wiktionary' | 'urban' }

/** Is FIRST followed by SECOND a real word or phrase? Built list first, then live Wiktionary, then Urban Dictionary. */
async function findLink(ctx: ChallengeContext, first: string, second: string): Promise<Found | null> {
  const known = lookup(ctx.dictionary, first, second)
  if (known) return { ...known, source: 'dictionary' }

  const community = await ctx.db.prepare('SELECT source FROM links WHERE from_word = ? AND to_word = ?').bind(first, second).first<{ source: string }>()
  if (community) return { form: formOf(community.source), base: LIVE_WIKTIONARY_BASE, source: 'wiktionary' }

  const key = `challenge:${first} ${second}`
  const cached = await ctx.db.prepare('SELECT verdict, source FROM lookups WHERE pair = ? AND checked_at > ?')
    .bind(key, ctx.now - LOOKUP_CACHE_MS).first<{ verdict: string; source: string | null }>()
  if (cached) {
    if (cached.verdict === 'wiktionary' && cached.source) return { form: formOf(cached.source), base: LIVE_WIKTIONARY_BASE, source: 'wiktionary' }
    if (cached.verdict === 'urban' && cached.source) return { form: formOf(cached.source), base: URBAN_BASE, source: 'urban' }
    return null
  }

  let found: Found | null = null
  let source: string | null = null
  try {
    const response = await fetch(wiktionaryUrl(first, second), { headers: { 'User-Agent': WIKTIONARY_UA, Accept: 'application/json' } })
    if (response.ok) {
      const verdict = judge(first, second, parsePages(await response.json()))
      if (verdict.ok) { source = verdict.source; found = { form: formOf(verdict.source), base: LIVE_WIKTIONARY_BASE, source: 'wiktionary' } }
      else if (verdict.reason === 'offensive') return remember(ctx, key, 'offensive', null)
    }
  } catch { /* fall through to Urban Dictionary */ }
  if (!found) {
    for (const [term, form] of [[first + second, 'c'], [`${first} ${second}`, 's']] as const) {
      try {
        const response = await fetch(urbanUrl(term), { headers: { Accept: 'application/json' } })
        if (response.ok && judgeUrban(term, await response.json())) {
          source = form === 'c' ? `${first}+${second}` : `${first} ${second}`
          found = { form, base: URBAN_BASE, source: 'urban' }
          break
        }
      } catch { /* treat as not found */ }
    }
  }
  await remember(ctx, key, found ? found.source : 'no', source)
  return found
}

async function remember(ctx: ChallengeContext, key: string, verdict: string, source: string | null): Promise<null> {
  await ctx.db.prepare('INSERT OR REPLACE INTO lookups (pair, verdict, source, checked_at) VALUES (?, ?, ?, ?)').bind(key, verdict, source, ctx.now).run()
  return null
}

const formOf = (source: string): Form => (source.includes('+') ? 'c' : source.includes('-') ? 'h' : 's')

export async function answer(request: Request, ctx: ChallengeContext): Promise<Response> {
  const body = await readBody(request)
  const run = await loadRun(ctx, body)
  if (!run) return ctx.json({ status: 'invalid' }, 404)
  if (run.finished_at !== null) return ctx.json({ status: 'over', ok: false, reason: 'over', done: true, score: run.score })

  const used = new Set<string>(JSON.parse(run.used) as string[])
  // Too late for this prompt: move on without points.
  if (ctx.now > run.ends_at + GRACE_MS) {
    return ctx.json({ status: 'ok', ok: false, reason: 'time', ...(await advance(ctx, run, used, 0, null)) })
  }

  const checks = checkWords(run.mode, run.prompt, used, { before: body?.before, after: body?.after }, ctx.dictionary.words)
  const before = 'before' in checks ? checks.before : null
  for (const [slot, check] of [['before', before], ['after', checks.after]] as const) {
    if (check && !check.ok) return ctx.json({ status: 'ok', ok: false, reason: check.reason, slot, endsIn: run.ends_at - ctx.now })
  }

  const words: { slot: Slot; word: string; first: string; second: string }[] = []
  if (before?.ok) words.push({ slot: 'before', word: before.word, first: before.word, second: run.prompt })
  if (checks.after.ok) words.push({ slot: 'after', word: checks.after.word, first: run.prompt, second: checks.after.word })

  const results = []
  for (const item of words) {
    const found = await findLink(ctx, item.first, item.second)
    if (!found) return ctx.json({ status: 'ok', ok: false, reason: 'unknown', slot: item.slot, endsIn: run.ends_at - ctx.now })
    results.push({ ...item, found })
  }

  // Score each word against how often players have given it to this prompt, then count this answer.
  const scored = []
  for (const item of results) {
    const counts = await ctx.db.prepare(
      `SELECT (SELECT total FROM prompt_counts WHERE slot = ? AND prompt = ?) AS total,
              (SELECT picks FROM answer_counts WHERE slot = ? AND prompt = ? AND answer = ?) AS picks`,
    ).bind(item.slot, run.prompt, item.slot, run.prompt, item.word).first<{ total: number | null; picks: number | null }>()
    const gained = points(item.found.base, counts?.picks ?? 0, counts?.total ?? 0)
    await ctx.db.prepare('INSERT INTO prompt_counts (slot, prompt, total) VALUES (?, ?, 1) ON CONFLICT(slot, prompt) DO UPDATE SET total = total + 1')
      .bind(item.slot, run.prompt).run()
    await ctx.db.prepare('INSERT INTO answer_counts (slot, prompt, answer, picks) VALUES (?, ?, ?, 1) ON CONFLICT(slot, prompt, answer) DO UPDATE SET picks = picks + 1')
      .bind(item.slot, run.prompt, item.word).run()
    scored.push({
      slot: item.slot,
      word: item.word,
      phrase: phraseOf(item.first, item.second, item.found.form),
      points: gained,
      source: item.found.source,
      players: counts?.total ?? 0,
    })
  }

  const gained = scored.reduce((sum, item) => sum + item.points, 0)
  for (const item of scored) used.add(item.word)
  const after = scored.find(item => item.slot === 'after')!.word
  const next = await advance(ctx, run, used, gained, after)
  return ctx.json({ status: 'ok', ok: true, results: scored, gained, ...next })
}

/** Moves on to the next prompt without points: the Skip button, or the bar running out. */
export async function skip(request: Request, ctx: ChallengeContext): Promise<Response> {
  const run = await loadRun(ctx, await readBody(request))
  if (!run) return ctx.json({ status: 'invalid' }, 404)
  if (run.finished_at !== null) return ctx.json({ status: 'ok', prompt: run.prompt, round: run.round, endsIn: 0, score: run.score, done: true })
  const used = new Set<string>(JSON.parse(run.used) as string[])
  return ctx.json({ status: 'ok', ...(await advance(ctx, run, used, 0, null)) })
}

/** Ends a run early (or confirms a finished one) and reports where it ranks. */
export async function finish(request: Request, ctx: ChallengeContext): Promise<Response> {
  const run = await loadRun(ctx, await readBody(request))
  if (!run) return ctx.json({ status: 'invalid' }, 404)
  if (run.finished_at === null) {
    await ctx.db.prepare('UPDATE runs SET finished_at = ? WHERE id = ?').bind(ctx.now, run.id).run()
    await recordBest(ctx, run.player_id, run.mode, run.score)
  }
  const column = run.mode === 'single' ? 'best_single' : 'best_double'
  const best = (await ctx.db.prepare(`SELECT ${column} AS b FROM players WHERE id = ?`).bind(run.player_id).first<{ b: number }>())?.b ?? run.score
  const rankAllTime = 1 + ((await ctx.db.prepare(`SELECT COUNT(*) AS n FROM players WHERE hidden = 0 AND ${column} > ?`).bind(best).first<{ n: number }>())?.n ?? 0)
  const since = Math.floor(ctx.now / DAY) * DAY
  const rankToday = 1 + ((await ctx.db.prepare(
    `SELECT COUNT(*) AS n FROM (SELECT r.player_id, MAX(r.score) AS s FROM runs r JOIN players p ON p.id = r.player_id
     WHERE r.mode = ? AND r.finished_at >= ? AND p.hidden = 0 AND r.player_id != ? GROUP BY r.player_id) WHERE s > ?`,
  ).bind(run.mode, since, run.player_id, run.score).first<{ n: number }>())?.n ?? 0)
  return ctx.json({ status: 'scored', mode: run.mode, score: run.score, answers: run.answers, best, rankToday, rankAllTime })
}
