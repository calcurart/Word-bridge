import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUZZLE_BY_ID } from '../src/data/puzzles.ts'
import {
  isValidBridge, parseBridge, parseCrossingRequest, routeShare, summarizeCrossings, yourRouteVerdict,
} from '../src/lib/crossings.ts'
import { buildGraph, dictionarySources } from '../src/lib/graph.ts'
import { dailyForDay, FIRST_DAY } from '../src/lib/schedule.ts'

const PLAYER = 'abcdef0123456789abcdef01'
const day = FIRST_DAY
const puzzle = PUZZLE_BY_ID.get(dailyForDay(day).puzzleId)!

test('crossing requests need a known player and a daily that exists', () => {
  assert.deepEqual(parseCrossingRequest({ player: PLAYER, day }, day), { player: PLAYER, day, bridge: null })
  assert.equal(parseCrossingRequest({ player: 'short', day }, day), null)
  assert.equal(parseCrossingRequest({ player: PLAYER, day: FIRST_DAY - 1 }, day), null)
  assert.equal(parseCrossingRequest({ player: PLAYER, day: day + 2 }, day), null)
  assert.equal(parseCrossingRequest({ player: PLAYER, day: day + 0.5 }, day), null)
  assert.notEqual(parseCrossingRequest({ player: PLAYER, day: day + 1 }, day), null)
  assert.equal(parseCrossingRequest(null, day), null)
})

test('a malformed bridge is dropped, not trusted', () => {
  const ok = parseCrossingRequest({ player: PLAYER, day, bridge: puzzle.solution.map(word => ` ${word.toUpperCase()} `) }, day)
  assert.deepEqual(ok?.bridge, puzzle.solution)
  for (const bridge of [puzzle.solution.slice(1), [...puzzle.solution, 'extra'], ['two words', ...puzzle.solution.slice(1)], [1, 2, 3], 'flower pot']) {
    assert.equal(parseCrossingRequest({ player: PLAYER, day, bridge }, day)?.bridge, null)
  }
})

test('spelling variants are stored in dictionary spelling', () => {
  const graph = buildGraph(['drum center', 'center court'], {}, { centre: 'center' })
  const words = Array.from({ length: puzzle.gaps }, () => 'centre')
  assert.deepEqual(parseBridge(words, day, graph), Array.from({ length: puzzle.gaps }, () => 'center'))
})

test('only bridges whose every link is in the dictionary are valid', () => {
  assert.equal(isValidBridge(day, puzzle.solution), true)
  assert.equal(isValidBridge(day, [...puzzle.solution.slice(0, -1), 'zzz']), false)
  assert.equal(isValidBridge(day, puzzle.solution.slice(1)), false)
  // A phrase suggested since the last sync makes a new route valid once the extra links are loaded.
  const odd = ['qqq', ...puzzle.solution.slice(1)]
  assert.equal(isValidBridge(day, odd), false)
  const extra = buildGraph(dictionarySources([`${puzzle.start} qqq`, `qqq ${puzzle.solution[1]}`]))
  assert.equal(isValidBridge(day, odd, extra), true)
})

test('routes are ranked by how many players took them', () => {
  const rows = [
    { bridge: 'b c', count: 3 }, { bridge: 'a c', count: 3 }, { bridge: 'd e', count: 10 },
    { bridge: 'f g', count: 1 }, { bridge: 'h i', count: 1 }, { bridge: 'j k', count: 1 }, { bridge: 'l m', count: 1 },
  ]
  const summary = summarizeCrossings(rows, 25, 'l m', 3)
  assert.equal(summary.solvers, 20)
  assert.equal(summary.finished, 25)
  assert.equal(summary.distinct, 7)
  assert.deepEqual(summary.routes, [
    { words: ['d', 'e'], count: 10 }, { words: ['a', 'c'], count: 3 }, { words: ['b', 'c'], count: 3 },
  ])
  assert.deepEqual(summary.yours, { words: ['l', 'm'], count: 1, rank: 4 })
  assert.equal(summarizeCrossings(rows, 25, 'b c').yours?.rank, 2)
  assert.equal(summarizeCrossings(rows, 25, null).yours, null)
  assert.equal(summarizeCrossings([], 0, null).solvers, 0)
  assert.equal(summarizeCrossings([{ bridge: 'a b', count: 2 }], 1, null).finished, 2)
})

test('shares never round a real route down to 0%', () => {
  assert.equal(routeShare(1, 400), '<1%')
  assert.equal(routeShare(46, 100), '46%')
  assert.equal(routeShare(1, 0), '0%')
})

test('the verdict on your own route', () => {
  const verdict = (rows: { bridge: string; count: number }[], yours: string | null) =>
    yourRouteVerdict(summarizeCrossings(rows, 0, yours))
  assert.equal(verdict([{ bridge: 'a b', count: 1 }], 'a b')?.tone, 'rare')
  assert.match(verdict([{ bridge: 'a b', count: 1 }], 'a b')!.text, /first across/)
  assert.match(verdict([{ bridge: 'a b', count: 5 }, { bridge: 'c d', count: 1 }], 'c d')!.text, /yours alone/)
  assert.match(verdict([{ bridge: 'a b', count: 5 }, { bridge: 'c d', count: 1 }], 'a b')!.text, /most popular route: 83%/)
  assert.match(verdict([{ bridge: 'a b', count: 4 }], 'a b')!.text, /same way/)
  assert.equal(verdict([{ bridge: 'a b', count: 30 }, { bridge: 'c d', count: 2 }], 'c d')?.tone, 'rare')
  assert.equal(verdict([{ bridge: 'a b', count: 5 }, { bridge: 'c d', count: 4 }], 'c d')?.tone, 'plain')
  assert.equal(verdict([{ bridge: 'a b', count: 5 }], null), null)
})
