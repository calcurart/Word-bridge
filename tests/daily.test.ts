import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUZZLE_BY_ID, PUZZLES } from '../src/data/puzzles.ts'
import { checkBridge, editEntry, gameStatus, newGame, takeHint } from '../src/lib/game.ts'
import type { GameRecord } from '../src/lib/game.ts'
import { pickPractice, rememberPractice } from '../src/lib/practice.ts'
import {
  dailyForDay, DAILY_ERAS, DAY_MS, FIRST_DATE, FIRST_DAY, formatCountdown, ORIGINAL_ORDER, timeUntilNextDay, utcDay,
} from '../src/lib/schedule.ts'
import type { DailyEra } from '../src/lib/schedule.ts'
import { shareText } from '../src/lib/share.ts'
import { dailyStats } from '../src/lib/stats.ts'
import {
  BACKUP_KEY, decodeSave, freshSave, loadSave, resetSave, STORAGE_KEY, withDaily, writeSave,
} from '../src/lib/storage.ts'
import type { Save } from '../src/lib/storage.ts'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

const dailyPuzzle = (day: number) => PUZZLE_BY_ID.get(dailyForDay(day).puzzleId)!

function play(day: number, words: readonly (readonly string[])[]): GameRecord {
  const puzzle = dailyPuzzle(day)
  let record = newGame(puzzle)
  for (const attempt of words) {
    record = attempt.reduce((current, word, gap) => editEntry(current, gap, word), record)
    const result = checkBridge(puzzle, record)
    if (result.kind === 'checked' || result.kind === 'duplicate') record = result.record
  }
  return record
}

const win = (day: number, misses = 0) => {
  const puzzle = dailyPuzzle(day)
  const wrong = Array.from({ length: misses }, (_, index) => puzzle.solution.map(() => `zz${'z'.repeat(index)}`))
  return play(day, [...wrong, puzzle.solution])
}
const lose = (day: number) => {
  const puzzle = dailyPuzzle(day)
  return play(day, ['qa', 'qb', 'qc', 'qd', 'qe'].map(word => puzzle.solution.map(() => word)))
}

test('one shared puzzle per UTC date, switching exactly at midnight UTC', () => {
  const first = Date.parse(`${FIRST_DATE}T00:00:00Z`)
  assert.equal(utcDay(first), FIRST_DAY)
  assert.equal(dailyForDay(utcDay(first)).number, 1)
  assert.equal(dailyForDay(utcDay(first)).puzzleId, ORIGINAL_ORDER[0])
  const lastMoment = first + DAY_MS - 1
  assert.equal(dailyForDay(utcDay(lastMoment)).puzzleId, ORIGINAL_ORDER[0])
  assert.equal(dailyForDay(utcDay(lastMoment + 1)).puzzleId, ORIGINAL_ORDER[1])
  assert.equal(dailyForDay(utcDay(lastMoment + 1)).number, 2)
  assert.equal(timeUntilNextDay(lastMoment), 1)
  assert.equal(timeUntilNextDay(first), DAY_MS)
  assert.equal(formatCountdown(3_723_000), '01:02:03')
  // A clock set before launch still gets puzzle #1.
  assert.equal(dailyForDay(FIRST_DAY - 10).number, 1)
  // The order cycles after the last puzzle.
  assert.equal(dailyForDay(FIRST_DAY + ORIGINAL_ORDER.length).puzzleId, ORIGINAL_ORDER[0])
  assert.ok(ORIGINAL_ORDER.every(id => PUZZLE_BY_ID.has(id)))
  assert.equal(DAILY_ERAS[0].order, ORIGINAL_ORDER)
})

test('a new era changes only future dates', () => {
  const eras: DailyEra[] = [...DAILY_ERAS, { start: FIRST_DAY + 100, order: ['tea-way', 'rain-shop'] }]
  for (let day = FIRST_DAY; day < FIRST_DAY + 100; day++) assert.deepEqual(dailyForDay(day, eras), dailyForDay(day))
  assert.equal(dailyForDay(FIRST_DAY + 100, eras).puzzleId, 'tea-way')
  assert.equal(dailyForDay(FIRST_DAY + 101, eras).puzzleId, 'rain-shop')
  assert.equal(dailyForDay(FIRST_DAY + 101, eras).number, 102)
})

test('unfinished and finished games restore exactly after a refresh', () => {
  const storage = new MemoryStorage()
  const day = FIRST_DAY + 3
  const puzzle = dailyPuzzle(day)
  let unfinished = play(day, [puzzle.solution.map(() => 'zz')])
  unfinished = editEntry(unfinished, 0, 'Typing…')
  const hinted = takeHint(dailyPuzzle(FIRST_DAY + 4), newGame(dailyPuzzle(FIRST_DAY + 4)))
  assert.equal(hinted.kind, 'hint')
  if (hinted.kind !== 'hint') return
  const save: Save = {
    ...freshSave(),
    theme: 'dark',
    tutorialSeen: true,
    daily: { [day]: unfinished, [FIRST_DAY]: win(FIRST_DAY, 2), [FIRST_DAY + 4]: hinted.record },
    practice: win(FIRST_DAY + 1),
    recentPractice: [dailyForDay(FIRST_DAY + 1).puzzleId],
  }
  assert.equal(writeSave(save, storage), true)
  const loaded = loadSave(storage)
  assert.equal(loaded.status, 'ok')
  assert.deepEqual(loaded.save, save)
  assert.equal(gameStatus(loaded.save.daily[day]), 'playing')
  assert.equal(loaded.save.daily[day].entries[0], 'Typing…')
  assert.equal(gameStatus(loaded.save.daily[FIRST_DAY]), 'won')
  assert.deepEqual(loaded.save.daily[FIRST_DAY + 4].hints, hinted.record.hints)
})

test('a finished daily result is recorded once and cannot be replayed', () => {
  const day = FIRST_DAY + 5
  const won = win(day, 1)
  let save = withDaily(freshSave(), day, won)
  const before = dailyStats(save.daily, day)
  assert.equal(before.played, 1)
  assert.deepEqual(before.distribution, [0, 1, 0, 0, 0])
  // Trying to store a replay of the same day leaves the original result in place.
  save = withDaily(save, day, newGame(dailyPuzzle(day)))
  save = withDaily(save, day, lose(day))
  assert.equal(save.daily[day], won)
  assert.equal(checkBridge(dailyPuzzle(day), won).kind, 'finished')
  // Reloading the same data any number of times gives the same statistics.
  const storage = new MemoryStorage()
  writeSave(save, storage)
  for (let index = 0; index < 3; index++) assert.deepEqual(dailyStats(loadSave(storage).save.daily, day), before)
})

test('streaks count consecutive daily wins; losses and missed days break them', () => {
  const d = FIRST_DAY + 10
  const daily: Record<string, GameRecord> = {
    [d]: win(d), [d + 1]: win(d + 1), [d + 2]: win(d + 2),
    [d + 3]: lose(d + 3),
    [d + 4]: win(d + 4), [d + 5]: win(d + 5),
    // d + 6 missed
    [d + 7]: win(d + 7),
  }
  const stats = dailyStats(daily, d + 7)
  assert.equal(stats.played, 7)
  assert.equal(stats.wins, 6)
  assert.equal(stats.winRate, 86)
  assert.equal(stats.bestStreak, 3)
  assert.equal(stats.currentStreak, 1)
  assert.equal(stats.distribution[0], 6)

  // An unfinished puzzle today does not erase yesterday's streak…
  const withToday = { ...daily, [d + 8]: play(d + 8, [dailyPuzzle(d + 8).solution.map(() => 'zz')]) }
  assert.equal(dailyStats(withToday, d + 8).currentStreak, 1)
  // …but a day with no result does.
  assert.equal(dailyStats(daily, d + 9).currentStreak, 0)
  // A loss today ends it immediately.
  assert.equal(dailyStats({ ...daily, [d + 8]: lose(d + 8) }, d + 8).currentStreak, 0)
  assert.equal(dailyStats({}, d).winRate, 0)
})

test('practice is separate from daily statistics and avoids recent puzzles', () => {
  const day = FIRST_DAY + 2
  const save: Save = { ...freshSave(), practice: win(FIRST_DAY + 30), recentPractice: [] }
  assert.equal(dailyStats(save.daily, day).played, 0)

  const today = dailyForDay(day).puzzleId
  const recent = PUZZLES.slice(0, 20).map(puzzle => puzzle.id)
  for (let index = 0; index < 50; index++) {
    const random = () => index / 50
    const picked = pickPractice(PUZZLES, new Set([today]), recent, random)
    assert.notEqual(picked.id, today)
    assert.ok(!recent.includes(picked.id))
  }
  // When everything has been played recently, it still picks something other than today's puzzle.
  const all = PUZZLES.map(puzzle => puzzle.id)
  assert.notEqual(pickPractice(PUZZLES, new Set([today]), all, () => 0.99).id, today)
  assert.deepEqual(rememberPractice(['a', 'b', 'c'], 'a'), ['b', 'c', 'a'])
})

test('corrupted, tampered or unavailable storage falls back to a playable game', () => {
  const storage = new MemoryStorage()
  storage.setItem(STORAGE_KEY, '{not json')
  const broken = loadSave(storage)
  assert.equal(broken.status, 'recovered')
  assert.deepEqual(broken.save, freshSave())
  assert.equal(storage.getItem(BACKUP_KEY), '{not json', 'unreadable data is backed up')

  assert.deepEqual(decodeSave(JSON.stringify({ version: 99 })).save, freshSave())
  assert.deepEqual(decodeSave(JSON.stringify([1, 2])).save, freshSave())

  const day = FIRST_DAY + 1
  const good = win(day)
  const tampered = {
    version: 1,
    theme: 'neon',
    daily: {
      [day]: good,
      [day + 1]: { ...win(day + 1), entries: ['only one'] },
      [day + 2]: { ...lose(day + 2), attempts: [...lose(day + 2).attempts, ...lose(day + 2).attempts] },
      [day + 3]: { ...win(day + 3), puzzleId: 'tea-way' },
      [day + 4]: { ...newGame(dailyPuzzle(day + 4)), hints: [{ gap: 0, word: 'zebra' }] },
      'not-a-day': good,
    },
    practice: { puzzleId: 'nope' },
    recentPractice: ['tea-way', 42, 'missing'],
  }
  const decoded = decodeSave(JSON.stringify(tampered))
  assert.equal(decoded.recovered, false)
  assert.deepEqual(Object.keys(decoded.save.daily), [String(day)])
  assert.equal(decoded.save.theme, 'system')
  assert.equal(decoded.save.practice, null)
  assert.deepEqual(decoded.save.recentPractice, ['tea-way'])

  const blocked = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('SecurityError') } }
  assert.equal(loadSave(blocked).status, 'unavailable')
  assert.equal(writeSave(freshSave(), blocked), false)

  const reset = resetSave({ ...freshSave(), theme: 'dark', daily: { [day]: good } })
  assert.deepEqual(reset.daily, {})
  assert.equal(reset.theme, 'dark')
})

test('share text is spoiler-free and sized to the puzzle', () => {
  const day = FIRST_DAY + 9
  const puzzle = dailyPuzzle(day)
  const won = win(day, 2)
  const text = shareText(won, { mode: 'daily', number: dailyForDay(day).number })
  const lines = text.split('\n')
  assert.equal(lines[0], `Word Bridge #${dailyForDay(day).number}`)
  assert.equal(lines[1], 'Solved in 3/5 checks · no hints')
  assert.equal(lines.length, 5)
  for (const row of lines.slice(2)) assert.equal([...row].length, puzzle.gaps + 1)
  assert.equal(lines.at(-1), '🟩'.repeat(puzzle.gaps + 1))

  const lost = lose(day)
  const lostText = shareText({ ...lost, hints: [{ gap: 0, word: puzzle.solution[0] }] }, { mode: 'practice' })
  assert.match(lostText, /^Word Bridge · Practice\nX\/5 checks · 1 hint\n/)

  for (const sample of [text, lostText]) {
    const lower = sample.toLowerCase()
    for (const word of [puzzle.start, puzzle.end, ...puzzle.solution, 'qa']) {
      assert.ok(!new RegExp(`\\b${word}\\b`).test(lower), `share text must not contain "${word}"`)
    }
  }
})
