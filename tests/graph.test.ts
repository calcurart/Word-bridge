import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUZZLES } from '../src/data/puzzles.ts'
import { auditContent } from '../src/lib/audit.ts'
import { buildGraph, canonicalWord, evaluateChain, findLink, GRAPH, isSingleWord, normalizeEntry, parseLink } from '../src/lib/graph.ts'
import { findPaths } from '../src/lib/paths.ts'
import { DAILY_ERAS } from '../src/lib/schedule.ts'

test('links are directed: FLOWER → POT does not allow POT → FLOWER', () => {
  assert.equal(findLink(GRAPH, 'flower', 'pot')?.phrase, 'flower pot')
  assert.equal(findLink(GRAPH, 'pot', 'flower'), undefined)
  assert.equal(findLink(GRAPH, 'sun', 'flower')?.phrase, 'sunflower')
  assert.equal(findLink(GRAPH, 'flower', 'sun'), undefined)
  assert.deepEqual(evaluateChain(GRAPH, ['sun', 'flower', 'pot', 'hole']), [true, true, true])
  assert.deepEqual(evaluateChain(GRAPH, ['hole', 'pot', 'flower', 'sun']), [false, false, false])
})

test('source entries parse into closed, open and hyphenated phrases', () => {
  assert.deepEqual(parseLink('sun+flower'), { from: 'sun', to: 'flower', phrase: 'sunflower' })
  assert.deepEqual(parseLink('flower pot'), { from: 'flower', to: 'pot', phrase: 'flower pot' })
  assert.deepEqual(parseLink('x-ray'), { from: 'x', to: 'ray', phrase: 'x-ray' })
  assert.equal(parseLink('Sun+flower'), null)
  assert.equal(parseLink('ice cream cone'), null)
  assert.equal(findLink(GRAPH, 'still', 'life')?.note, 'a painting of objects such as fruit or flowers')
})

test('entries are normalised for case, surrounding space and supported spelling variants', () => {
  assert.equal(normalizeEntry('  FlOwEr \t'), 'flower')
  assert.equal(normalizeEntry('flower  pot'), 'flower pot')
  assert.equal(isSingleWord('flower'), true)
  assert.equal(isSingleWord('flower pot'), false)
  assert.equal(isSingleWord('pot-hole'), false)
  assert.equal(canonicalWord(GRAPH, 'centre'), 'center')
  assert.equal(canonicalWord(GRAPH, 'colour'), 'color')
  assert.equal(findLink(GRAPH, 'call', 'centre')?.phrase, 'call center')
  assert.equal(findLink(GRAPH, 'water', 'colour')?.phrase, 'watercolor')
  assert.equal(findLink(GRAPH, 'snow', 'plough')?.phrase, 'snowplow')
  assert.equal(findLink(GRAPH, 'pick', 'ax')?.phrase, 'pickaxe')
})

test('ambiguous aliases are ignored by the graph and reported by the audit', () => {
  const links = ['sun+flower', 'flower pot', 'pot+hole', 'sun+set']
  const graph = buildGraph(links, {}, { set: 'pot', flour: 'flower' })
  assert.equal(graph.aliases.has('set'), false)
  assert.equal(graph.aliases.get('flour'), 'flower')
  const report = auditContent({ links, notes: {}, aliases: { set: 'pot', ghost: 'nowhere' }, puzzles: [], eras: [] })
  assert.ok(report.errors.some(error => error.includes('"set" is ambiguous')))
  assert.ok(report.errors.some(error => error.includes('"nowhere"')))
})

test('the content audit catches broken, duplicate and repetitive puzzles', () => {
  const links = ['sun+flower', 'flower pot', 'pot+hole', 'sun+set', 'sun+flower', 'set+hole']
  const report = auditContent({
    links,
    notes: { 'pot sun': 'no such link' },
    aliases: {},
    puzzles: [
      { id: 'a', start: 'sun', end: 'hole', gaps: 2, solution: ['flower', 'pot'], difficulty: 'easy' },
      { id: 'a', start: 'sun', end: 'hole', gaps: 2, solution: ['flower', 'pot'], difficulty: 'easy' },
      { id: 'b', start: 'sun', end: 'pot', gaps: 2, solution: ['set', 'hole'], difficulty: 'easy' },
      { id: 'c', start: 'pot', end: 'sun', gaps: 3, solution: ['hole', 'pot', 'sun'], difficulty: 'standard' },
      { id: 'd', start: 'sun', end: 'hole', gaps: 3, solution: ['flower'], difficulty: 'easy' },
    ],
    eras: [{ start: 0, order: ['a', 'missing', 'a'] }],
  })
  const has = (text: string) => assert.ok(report.errors.some(error => error.includes(text)), `expected an error containing "${text}"`)
  has('listed more than once')
  has('Note "pot sun"')
  has('Puzzle a: duplicate ID')
  has('same endpoints and length')
  has('missing link HOLE → POT')
  has('a word is repeated')
  has('Puzzle c: no bridge')
  has('easy puzzles need 2 gaps, not 3')
  has('solution has 1 words')
  has('unknown puzzle "missing"')
  has('lists "a" twice')
})

test('every shipped puzzle is valid, reachable and scheduled', () => {
  const report = auditContent()
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.warnings, [])
  assert.ok(PUZZLES.length >= 60, 'at least 60 puzzles')
  assert.ok(PUZZLES.some(puzzle => puzzle.gaps === 2) && PUZZLES.some(puzzle => puzzle.gaps === 3))
  for (const puzzle of PUZZLES) {
    const chain = [puzzle.start, ...puzzle.solution, puzzle.end]
    assert.equal(puzzle.solution.length, puzzle.gaps, puzzle.id)
    assert.ok(evaluateChain(GRAPH, chain).every(Boolean), `${puzzle.id} canonical links`)
    assert.equal(new Set(chain).size, chain.length, `${puzzle.id} repeats a word`)
    const paths = findPaths(GRAPH, puzzle.start, puzzle.end, puzzle.gaps)
    assert.ok(paths.some(path => path.join() === puzzle.solution.join()), `${puzzle.id} canonical solution is found by search`)
  }
  assert.equal(new Set(DAILY_ERAS[0].order).size, PUZZLES.length)
})

test('path search respects fixed words, never repeats words and stays bounded', () => {
  const tea = findPaths(GRAPH, 'tea', 'way', 3)
  assert.deepEqual(tea, [['cup', 'board', 'walk'], ['cup', 'cake', 'walk']])
  assert.deepEqual(findPaths(GRAPH, 'tea', 'way', 3, [null, 'cake', null]), [['cup', 'cake', 'walk']])
  assert.deepEqual(findPaths(GRAPH, 'tea', 'way', 3, ['pot', null, null]), [])
  assert.equal(findPaths(GRAPH, 'sun', 'sun', 2).length, 0)
  const started = performance.now()
  const wide = findPaths(GRAPH, 'back', 'house', 3, [], 50)
  assert.ok(wide.length <= 50)
  for (const path of wide) assert.equal(new Set(['back', ...path, 'house']).size, 5)
  assert.ok(performance.now() - started < 500, 'search is quick')
})
