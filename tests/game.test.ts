import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUZZLE_BY_ID, PUZZLES } from '../src/data/puzzles.ts'
import type { Puzzle } from '../src/data/puzzles.ts'
import {
  bestPath, carProgress, checkBridge, checksLeft, editEntry, fullChain, gameStatus, hintsLeft, MAX_CHECKS, maxHints, newGame,
  revealSolution, takeHint,
} from '../src/lib/game.ts'
import type { GameRecord } from '../src/lib/game.ts'
import { evaluateChain, GRAPH } from '../src/lib/graph.ts'
import { findPaths } from '../src/lib/paths.ts'

const puzzle = (id: string): Puzzle => PUZZLE_BY_ID.get(id)!
const tea = puzzle('tea-way') // TEA → CUP → BOARD → WALK → WAY, and TEA → CUP → CAKE → WALK → WAY
const drum = puzzle('drum-center') // DRUM → ROLL → CALL → CENTER

function fill(record: GameRecord, words: readonly string[]): GameRecord {
  return words.reduce((current, word, gap) => editEntry(current, gap, word), record)
}

function check(p: Puzzle, record: GameRecord) {
  const result = checkBridge(p, record)
  assert.ok(result.kind === 'checked' || result.kind === 'duplicate', `expected a check, got ${result.kind}`)
  return result.record
}

test('the canonical bridge wins and marks every connection valid', () => {
  const result = checkBridge(tea, fill(newGame(tea), ['cup', 'board', 'walk']))
  assert.equal(result.kind, 'checked')
  if (result.kind !== 'checked') return
  assert.deepEqual(result.links, [true, true, true, true])
  assert.equal(gameStatus(result.record), 'won')
  assert.equal(checkBridge(tea, result.record).kind, 'finished')
  assert.equal(editEntry(result.record, 0, 'pot'), result.record, 'finished games are read-only')
})

test('a different valid bridge is accepted, not just the intended solution', () => {
  const record = check(tea, fill(newGame(tea), ['Cup', ' CAKE ', 'walk']))
  assert.equal(gameStatus(record), 'won')
  assert.deepEqual(record.attempts[0].words, ['cup', 'cake', 'walk'])
  assert.deepEqual(record.entries, ['cup', 'cake', 'walk'], 'entries are tidied after a check')
})

test('a bridge with one unknown connection is rejected, with feedback on each connection', () => {
  const record = check(tea, fill(newGame(tea), ['pot', 'luck', 'walk']))
  assert.deepEqual(record.feedback, [true, true, false, true])
  assert.equal(gameStatus(record), 'playing')
  assert.equal(checksLeft(record), MAX_CHECKS - 1)
  assert.deepEqual(record.entries, ['pot', 'luck', 'walk'], 'typed words are kept for revising')
})

test('direction matters inside a bridge', () => {
  const sun: Puzzle = { id: 'sun-hole', start: 'sun', end: 'hole', gaps: 2, solution: ['flower', 'pot'], difficulty: 'easy' }
  const backwards = check(sun, fill(newGame(sun), ['pot', 'flower']))
  assert.deepEqual(backwards.feedback, [false, false, false])
})

test('spelling variants supported by the dictionary are accepted', () => {
  const variant = fill(newGame(drum), ['ROLL', 'call'])
  assert.equal(gameStatus(check(drum, variant)), 'won')
  assert.deepEqual(evaluateChain(GRAPH, ['salt', 'water', 'colour']), [true, true])
})

test('incomplete bridges and multi-word gaps do not use a check', () => {
  const partial = fill(newGame(tea), ['cup', '', 'walk'])
  assert.deepEqual(checkBridge(tea, partial), { kind: 'incomplete', gaps: [1] })
  const spaces = fill(newGame(tea), ['cup', '   ', 'walk'])
  assert.equal(checkBridge(tea, spaces).kind, 'incomplete')
  const phrase = fill(newGame(tea), ['cup', 'cup board', 'walk'])
  assert.deepEqual(checkBridge(tea, phrase), { kind: 'not-one-word', gaps: [1] })
  assert.equal(phrase.attempts.length, 0)
})

test('an identical normalised bridge does not use another check and restores its feedback', () => {
  const first = check(tea, fill(newGame(tea), ['pot', 'luck', 'walk']))
  const edited = editEntry(first, 1, 'hole')
  assert.deepEqual(edited.feedback, [true, null, null, true])
  const retyped = fill(edited, ['  POT', 'Luck ', 'walk'])
  const result = checkBridge(tea, retyped)
  assert.equal(result.kind, 'duplicate')
  if (result.kind !== 'duplicate') return
  assert.equal(result.attempt, 0)
  assert.equal(result.record.attempts.length, 1)
  assert.deepEqual(result.record.feedback, [true, true, false, true])
})

test('spelling variants count as the same bridge for duplicate checks', () => {
  const first = check(drum, fill(newGame(drum), ['roll', 'centre']))
  assert.equal(first.attempts.length, 1)
  const again = checkBridge(drum, fill(first, ['roll', 'center']))
  assert.equal(again.kind, 'duplicate')
})

test('five unsuccessful checks end the game and reveal a valid solution', () => {
  let record = newGame(tea)
  const tries = [['pot', 'luck', 'walk'], ['bag', 'pipe', 'line'], ['spoon', 'fork', 'knife'], ['time', 'table', 'cloth'], ['party', 'hat', 'trick']]
  for (const [index, words] of tries.entries()) {
    assert.equal(gameStatus(record), 'playing')
    record = check(tea, fill(record, words))
    assert.equal(record.attempts.length, index + 1)
  }
  assert.equal(gameStatus(record), 'lost')
  assert.equal(checksLeft(record), 0)
  assert.equal(checkBridge(tea, fill(record, ['cup', 'board', 'walk'])).kind, 'finished')
  const solution = revealSolution(tea, record)
  assert.ok(evaluateChain(GRAPH, fullChain(tea, solution)).every(Boolean))
})

test('editing a word clears only the feedback of its two neighbouring connections', () => {
  const standard = puzzle('rain-shop')
  const checked = check(standard, fill(newGame(standard), ['forest', 'fire', 'pot']))
  assert.deepEqual(checked.feedback, [true, true, false, false])
  const middle = editEntry(checked, 1, 'fir')
  assert.deepEqual(middle.feedback, [true, null, null, false])
  const caseOnly = editEntry(checked, 0, 'FOREST')
  assert.deepEqual(caseOnly.feedback, checked.feedback, 'a change of case keeps feedback')
  const last = editEntry(checked, 2, 'work')
  assert.deepEqual(last.feedback, [true, true, null, null])
  assert.deepEqual(last.attempts, checked.attempts, 'history is untouched')
})

test('the progress car drives over recognized links from the start and stops at the first other one', () => {
  assert.equal(carProgress([null, null, null, null]), 0)
  assert.equal(carProgress([true, true, false, true]), 2, 'stops before an unknown link')
  assert.equal(carProgress([true, null, null, true]), 1, 'an edited word sends it back')
  assert.equal(carProgress([false, true, true, true]), 0)
  assert.equal(carProgress([true, true, true, true]), 4, 'all the way across')
  // Through a real game: check, then edit the middle word, then fix it.
  const rain = puzzle('rain-shop')
  const checked = check(rain, fill(newGame(rain), ['forest', 'fire', 'pot']))
  assert.equal(carProgress(checked.feedback), 2)
  assert.equal(carProgress(editEntry(checked, 0, 'coat').feedback), 0)
  const fixed = check(rain, editEntry(checked, 2, 'work'))
  assert.equal(carProgress(fixed.feedback), 4)
})

test('hints prefer the bridge the player is already building', () => {
  const started = fill(newGame(tea), ['cup', 'cake', ''])
  const result = takeHint(tea, started)
  assert.equal(result.kind, 'hint')
  if (result.kind !== 'hint') return
  assert.equal(result.gap, 2)
  assert.equal(result.word, 'walk')
  assert.equal(result.conflicts, 0)
  assert.deepEqual(result.record.entries, ['cup', 'cake', 'walk'])
  assert.deepEqual(result.record.hints, [{ gap: 2, word: 'walk' }])
  assert.equal(result.record.attempts.length, 0, 'hints do not use a check')
  assert.equal(editEntry(result.record, 2, 'pot'), result.record, 'hinted words are fixed in place')
  assert.equal(gameStatus(check(tea, result.record)), 'won')
})

test('hints reveal a wrong gap and warn when other entries must change', () => {
  const wrong = fill(newGame(tea), ['pot', 'luck', 'walk'])
  const result = takeHint(tea, wrong)
  assert.equal(result.kind, 'hint')
  if (result.kind !== 'hint') return
  assert.equal(result.gap, 0)
  assert.equal(result.word, 'cup')
  assert.equal(result.replaced, 'pot')
  assert.equal(result.conflicts, 1, 'LUCK no longer fits')
})

test('hints preserve earlier hints and never make the puzzle impossible', () => {
  for (const p of PUZZLES) {
    let record = newGame(p)
    assert.equal(hintsLeft(p, record), maxHints(p))
    // Fill every gap with an unhelpful word to force hints to work around it.
    record = fill(record, p.solution.map(() => 'zebra'))
    for (let index = 0; index < maxHints(p); index++) {
      const result = takeHint(p, record)
      assert.equal(result.kind, 'hint', p.id)
      if (result.kind !== 'hint') return
      for (const hint of record.hints) assert.ok(result.record.hints.some(kept => kept.gap === hint.gap && kept.word === hint.word))
      record = result.record
      const fixed = Array.from({ length: p.gaps }, (_, gap) => record.hints.find(hint => hint.gap === gap)?.word ?? null)
      assert.ok(findPaths(GRAPH, p.start, p.end, p.gaps, fixed).length > 0, `${p.id} still solvable`)
    }
    assert.equal(takeHint(p, record).kind, 'unavailable')
    assert.ok(record.hints.length < p.gaps, 'at least one gap is left for the player')
    const solution = revealSolution(p, record)
    for (const hint of record.hints) assert.equal(solution[hint.gap], hint.word, `${p.id} reveal keeps hints`)
  }
})

test('the revealed solution after a loss follows the hints, even off the canonical path', () => {
  const started = fill(newGame(tea), ['cup', 'cake', ''])
  const hinted = takeHint(tea, started)
  assert.equal(hinted.kind, 'hint')
  if (hinted.kind !== 'hint') return
  assert.deepEqual(bestPath(tea, hinted.record), ['cup', 'cake', 'walk'])
  let record = editEntry(editEntry(hinted.record, 0, 'pot'), 1, 'luck')
  const tries = [['pot', 'luck'], ['bag', 'pipe'], ['spoon', 'fork'], ['time', 'table'], ['party', 'hat']]
  for (const [first, second] of tries) record = check(tea, editEntry(editEntry(record, 0, first), 1, second))
  assert.equal(gameStatus(record), 'lost')
  const solution = revealSolution(tea, record)
  assert.equal(solution[2], 'walk')
  assert.ok(evaluateChain(GRAPH, fullChain(tea, solution)).every(Boolean))
})
