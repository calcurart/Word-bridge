import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUZZLE_BY_ID } from '../src/data/puzzles.ts'
import { checkBridge, editEntry, gameStatus, newGame, recheckLatest } from '../src/lib/game.ts'
import type { GameRecord } from '../src/lib/game.ts'
import { buildGraph, communitySource, dictionarySources, findLink, GRAPH } from '../src/lib/graph.ts'
import { assessEntry, candidates, judge, parsePages, wiktionaryUrl } from '../worker/src/verify.ts'

const page = (body: string) => `==English==\n${body}\n\n==French==\n===Noun===\n# {{lb|fr|vulgar}} something\n`
const NOUN = page('===Etymology===\nFrom sun + hat.\n\n===Noun===\n{{en-noun}}\n\n# A light hat that protects the wearer from the sun.')
const ALT = page('===Noun===\n{{en-noun}}\n\n# {{alternative form of|en|sunhat}}.')
const VULGAR = page('===Noun===\n# {{lb|en|vulgar|slang}} Nonsense.\n# Feces.')
const OLD = page('===Noun===\n# {{lb|en|obsolete}} A kind of hat.\n# {{lb|en|archaic}} Another sense.')
const PROPER = page('===Proper noun===\n# A town in somewhere.')

test('Wiktionary entries are judged by part of speech, labels and language', () => {
  assert.equal(assessEntry(NOUN), 'ok')
  assert.equal(assessEntry(ALT), 'alternative')
  assert.equal(assessEntry(VULGAR), 'offensive')
  assert.equal(assessEntry(OLD), 'unfamiliar')
  assert.equal(assessEntry(PROPER), 'not-english', 'names (proper nouns) never count')
  assert.equal(assessEntry('==French==\n===Noun===\n# chapeau'), 'not-english')
})

test('a pair is accepted in its first suitable form and rejected if any form is offensive', () => {
  assert.deepEqual(candidates('sun', 'hat').map(c => c.title), ['sunhat', 'sun hat', 'sun-hat'])
  const found = new Map<string, string | null>([['sunhat', NOUN], ['sun hat', ALT], ['sun-hat', null]])
  assert.deepEqual(judge('sun', 'hat', found), { ok: true, source: 'sun+hat', title: 'sunhat' })
  const mainIsOpen = new Map<string, string | null>([['sidetable', ALT], ['side table', NOUN]])
  assert.deepEqual(judge('side', 'table', mainIsOpen), { ok: true, source: 'side table', title: 'side table' }, 'main spelling preferred')
  assert.deepEqual(judge('side', 'table', new Map([['sidetable', ALT]])), { ok: true, source: 'side+table', title: 'sidetable' }, 'an alternative form still counts')
  const openOnly = new Map<string, string | null>([['firealarm', null], ['fire alarm', NOUN], ['fire-alarm', null]])
  assert.deepEqual(judge('fire', 'alarm', openOnly), { ok: true, source: 'fire alarm', title: 'fire alarm' })
  const missing = new Map<string, string | null>([['barrowlift', null], ['barrow lift', null], ['barrow-lift', null]])
  assert.deepEqual(judge('barrow', 'lift', missing), { ok: false, reason: 'not-found' })
  assert.deepEqual(judge('bull', 'frog', new Map([['bullfrog', VULGAR], ['bull frog', NOUN]])), { ok: false, reason: 'offensive' })
  assert.deepEqual(judge('old', 'hat', new Map([['oldhat', OLD]])), { ok: false, reason: 'unfamiliar' })
  assert.deepEqual(judge('bull', 'shit', new Map()), { ok: false, reason: 'offensive' }, 'blocked words never reach the dictionary')
  assert.deepEqual(judge('Sun', 'hat', found), { ok: false, reason: 'invalid' })
  assert.deepEqual(judge('sun', 'sun', found), { ok: false, reason: 'invalid' })
})

test('the dictionary request and response are handled in one call', () => {
  const url = new URL(wiktionaryUrl('sun', 'hat'))
  assert.equal(url.hostname, 'en.wiktionary.org')
  assert.equal(url.searchParams.get('titles'), 'sunhat|sun hat|sun-hat')
  const pages = parsePages({
    query: {
      pages: [
        { title: 'sunhat', revisions: [{ slots: { main: { content: NOUN } } }] },
        { title: 'sun-hat', missing: true },
      ],
    },
  })
  assert.equal(pages.get('sunhat'), NOUN)
  assert.equal(pages.get('sun-hat'), null)
  assert.equal(parsePages({}).size, 0)
})

// These tests use made-up words (ZORK, BLAT) so phrases synced from real suggestions can never affect them.
test('community phrases are cleaned: spellings unified, banned and malformed links dropped', () => {
  assert.equal(communitySource('zork+blat'), 'zork+blat')
  assert.equal(communitySource('colour zork'), 'color zork')
  assert.equal(communitySource('pot+flower'), null, 'NEVER_LINKS wins over suggestions')
  assert.equal(communitySource('Zork blat'), null)
  assert.equal(communitySource('zork+zork'), null)
  const sources = dictionarySources(['zork+blat', 'zork blat', 'sun+flower', 'colour+zork'])
  assert.equal(sources.filter(source => source.startsWith('zork') && source.endsWith('blat')).length, 1, 'no duplicate links')
  assert.equal(sources.filter(source => source === 'sun+flower').length, 1, 'built-in links are not repeated')
  const graph = buildGraph(sources)
  assert.equal(findLink(graph, 'zork', 'blat')?.phrase, 'zorkblat')
  assert.equal(findLink(graph, 'colour', 'zork')?.phrase, 'colorzork', 'aliases still work for new words')
  assert.equal(findLink(GRAPH, 'zork', 'blat'), undefined, 'the built-in graph is unchanged')
})

const honey = () => PUZZLE_BY_ID.get('honey-house')! // HONEY → MOON → LIGHT → HOUSE
const zorkLinks = ['moon+zork', 'zork+house']

test('an accepted suggestion re-checks the latest bridge for free and can complete it', () => {
  const puzzle = honey()
  let record: GameRecord = editEntry(editEntry(newGame(puzzle), 0, 'moon'), 1, 'zork')
  const checked = checkBridge(puzzle, record)
  assert.equal(checked.kind, 'checked')
  if (checked.kind !== 'checked') return
  record = checked.record
  assert.deepEqual(record.feedback, [true, false, false])

  assert.equal(recheckLatest(puzzle, record, buildGraph()), record, 'nothing changes without a new phrase')

  const after = buildGraph(dictionarySources(zorkLinks))
  const rechecked = recheckLatest(puzzle, record, after)
  assert.equal(rechecked.attempts.length, 1, 'no check is used')
  assert.deepEqual(rechecked.feedback, [true, true, true])
  assert.equal(gameStatus(rechecked), 'won')

  // If the player has already changed the words, nothing is re-checked.
  const edited = editEntry(record, 1, 'walk')
  assert.equal(recheckLatest(puzzle, edited, after), edited)
})

test('a repeated bridge is free unless the dictionary has changed its result', () => {
  const puzzle = honey()
  const first = checkBridge(puzzle, editEntry(editEntry(newGame(puzzle), 0, 'moon'), 1, 'zork'))
  assert.equal(first.kind, 'checked')
  if (first.kind !== 'checked') return
  assert.equal(checkBridge(puzzle, first.record).kind, 'duplicate')
  const again = checkBridge(puzzle, first.record, buildGraph(dictionarySources(zorkLinks)))
  assert.equal(again.kind, 'checked')
  if (again.kind === 'checked') assert.equal(gameStatus(again.record), 'won')
})

test('finished games are never changed by a later phrase', () => {
  const puzzle = honey()
  let record = newGame(puzzle)
  for (const word of ['qa', 'qb', 'qc', 'qd', 'zork']) {
    record = editEntry(editEntry(record, 0, 'moon'), 1, word)
    const result = checkBridge(puzzle, record)
    if (result.kind === 'checked') record = result.record
  }
  assert.equal(gameStatus(record), 'lost')
  assert.equal(recheckLatest(puzzle, record, buildGraph(dictionarySources(zorkLinks))), record)
})