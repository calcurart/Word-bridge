// Word Bridge phrase service (Cloudflare Worker + D1).
//
//   GET  /links    -> { links: string[] }   every phrase added from player suggestions ("sun+hat", "fire alarm")
//   POST /suggest  { from, to } -> { status, source? }
//
// A suggestion is looked up in Wiktionary. If FIRST+SECOND is a real, suitable English word or phrase it is
// stored and served to every player. No accounts, no secrets: IP addresses are only kept as salted hashes
// for rate limiting, and suggestion records are deleted after 30 days.
//
// It also counts finished games and runs the leaderboard and challenge scoring: see scores.ts.
import dictionaryText from '../data/challenge-words.txt'
import wordsText from '../data/english-words.txt'
import { answer, finish, skip, startRun } from './challenge-api.ts'
import type { ChallengeContext } from './challenge-api.ts'
import { parseDictionary } from './challenge-engine.ts'
import { leaderboard, reportGame, updatePlayer } from './scores.ts'
import type { Context } from './scores.ts'
import type { Env } from './types.ts'
import { judge, parsePages, WORD, wiktionaryUrl } from './verify.ts'
import type { Verdict } from './verify.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const PER_IP_PER_HOUR = 20
const ADDITIONS_PER_DAY = 300
const LOOKUP_CACHE_MS = 7 * DAY
const USER_AGENT = 'WordBridgePhraseCheck/1.0 (word game phrase checker; Cloudflare Worker)'

// The challenge dictionary is parsed once when the Worker starts, not on every request.
const DICTIONARY = parseDictionary(dictionaryText, wordsText)

type Status = 'added' | 'exists' | 'invalid' | 'not-found' | 'offensive' | 'unfamiliar' | 'rate-limited' | 'error'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map(item => item.trim()).filter(Boolean)
    const cors: Record<string, string> = allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {}

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' },
      })
    }

    try {
      if (url.pathname === '/links' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT source FROM links ORDER BY added_at, source').all<{ source: string }>()
        return json({ links: rows.results.map(row => row.source) }, 200, {
          // The list is public; any page may read it. Short caching keeps load on the database low.
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60',
        })
      }
      if (url.pathname === '/suggest' && request.method === 'POST') {
        if (!allowed.includes(origin)) return json({ status: 'invalid' }, 403, cors)
        return await suggest(request, env, cors)
      }
      const scoreRoutes: Record<string, (ctx: Context & ChallengeContext) => Promise<Response>> = {
        'POST /games': ctx => reportGame(request, ctx),
        'POST /challenge/start': ctx => startRun(request, ctx),
        'POST /challenge/answer': ctx => answer(request, ctx),
        'POST /challenge/skip': ctx => skip(request, ctx),
        'POST /challenge/finish': ctx => finish(request, ctx),
        'POST /player': ctx => updatePlayer(request, ctx),
        'GET /leaderboard': ctx => leaderboard(url, ctx),
      }
      const handler = scoreRoutes[`${request.method} ${url.pathname}`]
      if (handler) {
        if (!allowed.includes(origin)) return json({ status: 'invalid' }, 403, cors)
        const ctx: Context & ChallengeContext = {
          db: env.DB,
          dictionary: DICTIONARY,
          now: Date.now(),
          ipHash: await hashIp(env, request.headers.get('CF-Connecting-IP') ?? 'unknown'),
          json: (body, status = 200) => json(body, status, { ...cors, 'Cache-Control': 'no-store' }),
        }
        return await handler(ctx)
      }
      if (url.pathname === '/' && request.method === 'GET') {
        return new Response('Word Bridge phrase service. See /links.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      return json({ status: 'invalid' }, 404, cors)
    } catch {
      return json({ status: 'error' }, 500, cors)
    }
  },
}

async function suggest(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let body: { from?: unknown; to?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ status: 'invalid' }, 400, cors)
  }
  const from = typeof body.from === 'string' ? body.from.trim().toLowerCase() : ''
  const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : ''
  if (!WORD.test(from) || !WORD.test(to) || from === to) return json({ status: 'invalid' }, 400, cors)

  const now = Date.now()
  const pair = `${from} ${to}`
  const ipHash = await hashIp(env, request.headers.get('CF-Connecting-IP') ?? 'unknown')
  await env.DB.prepare('DELETE FROM suggestions WHERE created_at < ?').bind(now - 30 * DAY).run()

  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, now - HOUR).first<{ n: number }>()
  if ((recent?.n ?? 0) >= PER_IP_PER_HOUR) return json({ status: 'rate-limited' }, 429, cors)

  const record = (verdict: Status) =>
    env.DB.prepare('INSERT INTO suggestions (pair, ip_hash, verdict, created_at) VALUES (?, ?, ?, ?)').bind(pair, ipHash, verdict, now).run()

  const existing = await env.DB.prepare('SELECT source FROM links WHERE from_word = ? AND to_word = ?').bind(from, to).first<{ source: string }>()
  if (existing) {
    await record('exists')
    return json({ status: 'exists', source: existing.source }, 200, cors)
  }

  // Reuse a recent dictionary lookup for the same pair instead of asking Wiktionary again.
  let verdict: Verdict
  const cached = await env.DB.prepare('SELECT verdict, source FROM lookups WHERE pair = ? AND checked_at > ?')
    .bind(pair, now - LOOKUP_CACHE_MS).first<{ verdict: string; source: string | null }>()
  if (cached) {
    verdict = cached.verdict === 'ok' && cached.source
      ? { ok: true, source: cached.source, title: cached.source.replace('+', '') }
      : { ok: false, reason: cached.verdict as 'not-found' | 'offensive' | 'unfamiliar' }
  } else {
    const response = await fetch(wiktionaryUrl(from, to), { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
    if (!response.ok) return json({ status: 'error' }, 502, cors)
    verdict = judge(from, to, parsePages(await response.json()))
    await env.DB.prepare('INSERT OR REPLACE INTO lookups (pair, verdict, source, checked_at) VALUES (?, ?, ?, ?)')
      .bind(pair, verdict.ok ? 'ok' : verdict.reason, verdict.ok ? verdict.source : null, now).run()
  }

  if (!verdict.ok) {
    await record(verdict.reason)
    return json({ status: verdict.reason }, 200, cors)
  }

  const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM links WHERE added_at > ?').bind(now - DAY).first<{ n: number }>()
  if ((today?.n ?? 0) >= ADDITIONS_PER_DAY) return json({ status: 'rate-limited' }, 429, cors)

  await env.DB.prepare('INSERT OR IGNORE INTO links (from_word, to_word, source, title, added_at) VALUES (?, ?, ?, ?, ?)')
    .bind(from, to, verdict.source, verdict.title, now).run()
  await record('added')
  return json({ status: 'added', source: verdict.source }, 200, cors)
}

/** Salted SHA-256 of the client IP. The salt is generated once and kept in the database. */
async function hashIp(env: Env, ip: string): Promise<string> {
  const fresh = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('')
  await env.DB.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('salt', ?)").bind(fresh).run()
  const salt = (await env.DB.prepare("SELECT value FROM meta WHERE key = 'salt'").first<{ value: string }>())?.value ?? fresh
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } })
}
