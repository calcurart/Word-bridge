import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUZZLE_BY_ID } from '../src/data/puzzles.ts'
import { formatClock, rarity } from '../src/lib/challenge.ts'
import { newGame } from '../src/lib/game.ts'
import { decodeSave, freshSave, gameKey, randomId, resetSave } from '../src/lib/storage.ts'
import {
  checkWords, lookup, nextPrompt, normalizeWord, parseDictionary, phraseOf, pickPrompt, points,
} from '../worker/src/challenge-engine.ts'
import { cleanName, parseGameReport } from '../worker/src/leaderboard.ts'
import { judgeUrban } from '../worker/src/urban.ts'

const SAMPLE = `# sample
#single forest fire sun
#double forest fire
forest fire s 20
forest floor s 55
rain forest c 15
fire work c 25
fire place c 30
sun flower c 35
camp fire c 40
`
const dictionary = parseDictionary(SAMPLE)

test('the dictionary reads links, written forms, base rarity and prompt lists', () => {
  assert.equal(dictionary.size, 7)
  assert.deepEqual(lookup(dictionary, 'forest', 'fire'), { form: 's', base: 20 })
  assert.equal(lookup(dictionary, 'fire', 'forest'), undefined, 'order matters: FIRE FOREST is not FOREST FIRE')
  assert.deepEqual(dictionary.prompts.single, ['forest', 'fire', 'sun'])
  assert.equal(phraseOf('sun', 'flower', 'c'), 'sunflower')
  assert.equal(phraseOf('forest', 'fire', 's'), 'forest fire')
  assert.equal(phraseOf('x', 'ray', 'h'), 'x-ray')
})

test('Single takes one word after the prompt; Double one before and one after', () => {
  const used = new Set(['forest'])
  assert.deepEqual(checkWords('single', 'forest', used, { after: ' Fire ' }), { after: { ok: true, word: 'fire' } })
  assert.deepEqual(checkWords('single', 'forest', used, { after: '' }), { after: { ok: false, reason: 'missing' } })
  assert.deepEqual(checkWords('single', 'forest', used, { after: 'forest' }), { after: { ok: false, reason: 'same' } })
  assert.deepEqual(checkWords('single', 'forest', used, { after: 'forest fire' }), { after: { ok: false, reason: 'not-one-word' } })
  assert.deepEqual(checkWords('single', 'fire', new Set(['forest', 'fire']), { after: 'forest' }), { after: { ok: false, reason: 'used' } })
  assert.deepEqual(checkWords('double', 'forest', used, { before: 'rain', after: 'fire' }), {
    before: { ok: true, word: 'rain' }, after: { ok: true, word: 'fire' },
  })
  assert.equal(checkWords('double', 'forest', used, { before: 'fire', after: 'fire' }).before?.ok, false)
  assert.equal(checkWords('double', 'forest', used, { after: 'fire' }).before?.ok, false, 'Double needs both words')
  assert.equal(normalizeWord('Ünïcode'), null)
})

test('rarity points run from 10 to 100 and move toward what other players answer', () => {
  assert.equal(points(20, 0, 0), 20, 'with no players yet, the common-usage score stands')
  assert.equal(points(5, 0, 0), 10, 'never below 10')
  assert.equal(points(140, 0, 0), 100, 'never above 100')
  // A common phrase that many players give stays low; one nobody else gives climbs.
  assert.ok(points(20, 400, 1000) <= 20)
  assert.ok(points(20, 0, 1000) >= 90)
  // A "rare" dictionary phrase that half of all players give sinks toward the minimum.
  assert.ok(points(80, 500, 1000) < 20)
  // Early on, a few players barely move the score.
  assert.ok(Math.abs(points(50, 1, 2) - 50) <= 10)
  assert.equal(rarity(95).label, 'Nearly impossible')
  assert.equal(rarity(10).tier, 'common')
  assert.equal(formatClock(61_200), '1:02')
})

test('prompts chain from the word after, when it is a good prompt that has not been used', () => {
  assert.equal(nextPrompt(dictionary, 'single', 'fire', new Set(['forest'])), 'fire')
  assert.equal(nextPrompt(dictionary, 'single', 'work', new Set(['forest', 'fire']), () => 0), 'sun', 'WORK is not a prompt word')
  assert.equal(pickPrompt(dictionary, 'single', new Set(['forest', 'fire']), () => 0), 'sun', 'unused prompts first')
})

test('Urban Dictionary slang counts when several people defined exactly that term, cleanly', () => {
  const entries = (word: string, definition: string, count = 4) =>
    Array.from({ length: count }, (_, index) => ({ word, definition, author: `author${index}` }))
  assert.equal(judgeUrban('touch grass', { list: entries('Touch Grass', 'Go outside and take a break from the internet.') }), true)
  assert.equal(judgeUrban('touch grass', { list: entries('touch grasses', 'Go outside.') }), false, 'must match exactly')
  assert.equal(judgeUrban('touch grass', { list: entries('touch grass', 'Go outside.', 2) }), false, 'one or two definitions might be a joke')
  const sameAuthor = entries('touch grass', 'Go outside.').map(entry => ({ ...entry, author: 'one person' }))
  assert.equal(judgeUrban('touch grass', { list: sameAuthor }), false, 'needs several different authors')
  assert.equal(judgeUrban('touch grass', { list: entries('touch grass', 'Something about sex.') }), false, 'crude definitions are refused')
  assert.equal(judgeUrban('shitpost', { list: entries('shitpost', 'A low-effort post.') }), false, 'crude terms are refused')
  assert.equal(judgeUrban('class act', { list: entries('class act', 'A person with grace and good manners.') }), true)
  assert.equal(judgeUrban('x', null), false)
})

test('leaderboard names and game reports are validated', () => {
  assert.equal(cleanName('  Sky   Walker '), 'Sky Walker')
  assert.equal(cleanName('ShitLord'), null)
  assert.equal(cleanName('Glass Bridge'), 'Glass Bridge')
  const player = 'a1b2c3d4e5f6a7b8c9d0e1f2'
  const ok = { player, gameId: 'daily-20779', mode: 'daily', won: true, checks: 2, hints: 0 }
  assert.deepEqual(parseGameReport(ok, 20_780), ok)
  assert.equal(parseGameReport({ ...ok, gameId: 'daily-20790' }, 20_780), null)
  assert.equal(parseGameReport({ ...ok, won: false, checks: 3 }, 20_780), null)
})

test('leaderboard identity, reported games and per-mode bests survive a reload', () => {
  const player = randomId()
  const practice = { ...newGame(PUZZLE_BY_ID.get('tea-way')!), gameId: randomId('practice-') }
  const save = { ...freshSave(), playerId: player, playerName: 'Bridge Fan', showOnLeaderboard: false, reported: ['daily-20776'], bestSingle: 340, bestDouble: 120, practice, recentPractice: ['tea-way'] }
  assert.deepEqual(decodeSave(JSON.stringify(save)).save, save)
  assert.equal(gameKey('practice', practice), practice.gameId)
  const old = decodeSave(JSON.stringify({ version: 1, theme: 'dark', tutorialSeen: true, daily: {}, practice: null, recentPractice: [], challengeBest: 9 })).save
  assert.equal(old.bestSingle, 0)
  assert.equal(old.playerId, '')
  const reset = resetSave(save)
  assert.equal(reset.playerId, player)
  assert.equal(reset.bestSingle, 0)
})
