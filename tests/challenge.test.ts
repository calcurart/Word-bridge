import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkAnswer, connections, formatClock, MAX_ANSWERS, nextPrompt, pickPrompt, promptPool, scoreAnswers,
} from '../src/lib/challenge.ts'
import { GRAPH } from '../src/lib/graph.ts'
import { decodeSave, freshSave, gameKey, randomId, resetSave } from '../src/lib/storage.ts'
import { newGame } from '../src/lib/game.ts'
import { PUZZLE_BY_ID } from '../src/data/puzzles.ts'
import { cleanName, parseAnswers, parseGameReport } from '../worker/src/leaderboard.ts'

test('a challenge answer may come before or after the prompt word', () => {
  const used = new Set(['forest'])
  const after = checkAnswer(GRAPH, 'forest', 'Fire', used)
  assert.ok(after.ok && after.link.phrase === 'forest fire')
  const before = checkAnswer(GRAPH, 'forest', ' rain ', used)
  assert.ok(before.ok && before.link.phrase === 'rainforest')
  assert.deepEqual(checkAnswer(GRAPH, 'forest', 'banana', used), { ok: false, reason: 'unknown' })
  assert.deepEqual(checkAnswer(GRAPH, 'forest', 'forest', used), { ok: false, reason: 'same' })
  assert.deepEqual(checkAnswer(GRAPH, 'forest', '', used), { ok: false, reason: 'empty' })
  assert.deepEqual(checkAnswer(GRAPH, 'forest', 'rain forest', used), { ok: false, reason: 'not-one-word' })
  assert.deepEqual(checkAnswer(GRAPH, 'forest', 'fire', new Set(['forest', 'fire'])), { ok: false, reason: 'used' })
  const alias = checkAnswer(GRAPH, 'call', 'centre', used)
  assert.ok(alias.ok && alias.word === 'center', 'spelling variants count')
})

test('prompts are well connected and the chain continues from the answer when it can', () => {
  const pool = promptPool(GRAPH)
  assert.ok(pool.length >= 50, `enough prompt words (${pool.length})`)
  for (const word of pool) assert.ok(connections(GRAPH, word).length >= 4, word)
  assert.equal(nextPrompt(GRAPH, 'fire', new Set(['forest', 'fire'])), 'fire', 'FIRE has many unused links, so it becomes the next word')
  const tiny = new Set([...connections(GRAPH, 'fire'), 'fire'])
  assert.notEqual(nextPrompt(GRAPH, 'fire', tiny, () => 0), 'fire', 'a word with no unused links is replaced')
  const used = new Set(pool.slice(0, -1))
  assert.equal(pickPrompt(GRAPH, used, () => 0), pool.at(-1), 'unused prompts are preferred')
})

test('the server-side recount only scores valid, unrepeated answers', () => {
  assert.equal(scoreAnswers(GRAPH, [['forest', 'fire'], ['fire', 'work'], ['work', 'shop']]), 3)
  assert.equal(scoreAnswers(GRAPH, [['forest', 'fire'], ['fire', 'banana'], ['fire', 'work']]), 2, 'wrong answers score nothing')
  assert.equal(scoreAnswers(GRAPH, [['forest', 'fire'], ['forest', 'fire']]), 1, 'a word counts once')
  assert.equal(scoreAnswers(GRAPH, [['forest', 'fire'], ['fire', 'forest']]), 1, 'cannot bounce back to an earlier word')
  assert.equal(scoreAnswers(GRAPH, [['Forest!', 'fire']]), 0)
  const spam = Array.from({ length: MAX_ANSWERS + 50 }, () => ['forest', 'fire'] as const)
  assert.ok(scoreAnswers(GRAPH, spam) <= 1)
  assert.equal(formatClock(300_000), '5:00')
  assert.equal(formatClock(61_200), '1:02')
  assert.equal(formatClock(-5), '0:00')
})

test('leaderboard names are tidied and offensive ones refused', () => {
  assert.equal(cleanName('  Sky   Walker '), 'Sky Walker')
  assert.equal(cleanName('Zoë_99'), 'Zoë_99')
  assert.equal(cleanName('a'), null)
  assert.equal(cleanName('x'.repeat(21)), null)
  assert.equal(cleanName('<script>'), null)
  assert.equal(cleanName('ShitLord'), null)
  assert.equal(cleanName('f.u.c.k'), null)
  assert.equal(cleanName(42), null)
  assert.equal(cleanName('Glass Bridge'), 'Glass Bridge', 'innocent words that contain short fragments are fine')
})

test('game reports and challenge answers are validated before they count', () => {
  const player = 'a1b2c3d4e5f6a7b8c9d0e1f2'
  const today = 20_780
  const ok = { player, gameId: 'daily-20779', mode: 'daily', won: true, checks: 2, hints: 0 }
  assert.deepEqual(parseGameReport(ok, today), ok)
  assert.equal(parseGameReport({ ...ok, gameId: 'daily-20790' }, today), null, 'no future dates')
  assert.equal(parseGameReport({ ...ok, mode: 'practice' }, today), null, 'mode must match the ID')
  assert.equal(parseGameReport({ ...ok, won: false, checks: 3 }, today), null, 'a loss uses all five checks')
  assert.equal(parseGameReport({ ...ok, checks: 9 }, today), null)
  assert.equal(parseGameReport({ ...ok, player: 'short' }, today), null)
  assert.ok(parseGameReport({ ...ok, gameId: `practice-${'ab12'.repeat(6)}`, mode: 'practice', won: false, checks: 5, hints: 1 }, today))
  assert.deepEqual(parseAnswers([['forest', 'fire']], 10), [['forest', 'fire']])
  assert.equal(parseAnswers([['forest']], 10), null)
  assert.equal(parseAnswers('nope', 10), null)
  assert.equal(parseAnswers(Array.from({ length: 11 }, () => ['a', 'b']), 10), null)
})

test('leaderboard identity and reported games survive a reload; reset keeps the identity', () => {
  const player = randomId()
  assert.match(player, /^[a-f0-9]{24}$/)
  const practice = { ...newGame(PUZZLE_BY_ID.get('tea-way')!), gameId: randomId('practice-') }
  const save = { ...freshSave(), playerId: player, playerName: 'Bridge Fan', showOnLeaderboard: false, reported: ['daily-20776'], challengeBest: 17, practice, recentPractice: ['tea-way'] }
  const loaded = decodeSave(JSON.stringify(save)).save
  assert.deepEqual(loaded, save)
  assert.equal(gameKey('practice', loaded.practice!), practice.gameId)
  assert.equal(gameKey('daily', loaded.practice!, 20_776), 'daily-20776')
  // Older saves without these fields still load, with defaults.
  const old = decodeSave(JSON.stringify({ version: 1, theme: 'dark', tutorialSeen: true, daily: {}, practice: null, recentPractice: [] })).save
  assert.equal(old.playerId, '')
  assert.equal(old.showOnLeaderboard, true)
  assert.deepEqual(old.reported, [])
  const bad = decodeSave(JSON.stringify({ ...save, playerId: 'NOT VALID!', reported: ['x', 5], challengeBest: -3 })).save
  assert.equal(bad.playerId, '')
  assert.deepEqual(bad.reported, [])
  assert.equal(bad.challengeBest, 0)
  const reset = resetSave(save)
  assert.equal(reset.playerId, player)
  assert.equal(reset.playerName, 'Bridge Fan')
  assert.equal(reset.practice, null)
  assert.equal(reset.challengeBest, 0)
})
