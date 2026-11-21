import { PUZZLE_BY_ID } from '../data/puzzles.ts'
import type { Puzzle } from '../data/puzzles.ts'
import { canonicalWord, GRAPH, isSingleWord, normalizeEntry } from './graph.ts'
import { gameStatus, MAX_CHECKS, MAX_ENTRY_LENGTH, maxHints } from './game.ts'
import type { Attempt, GameRecord, Hint, LinkFeedback } from './game.ts'
import { GAME_ID, PLAYER_ID } from './ids.ts'
import { dailyForDay, FIRST_DAY } from './schedule.ts'

export { GAME_ID, PLAYER_ID }

export const STORAGE_KEY = 'wordbridge.save'
export const BACKUP_KEY = 'wordbridge.save.unreadable'
const VERSION = 1
export const PRACTICE_MEMORY = 30
const REPORTED_MEMORY = 1000

export type Theme = 'system' | 'light' | 'dark'

export type Save = {
  readonly version: typeof VERSION
  readonly theme: Theme
  readonly tutorialSeen: boolean
  /** Daily games keyed by UTC day number. */
  readonly daily: Readonly<Record<string, GameRecord>>
  /** The current practice game, kept apart from daily records and statistics. */
  readonly practice: GameRecord | null
  /** Recently played practice puzzle IDs, oldest first. */
  readonly recentPractice: readonly string[]
  /** Anonymous random ID for the global leaderboard ('' until first needed). */
  readonly playerId: string
  /** Display name chosen for the leaderboard; null means the default "Bridge Builder" name. */
  readonly playerName: string | null
  readonly showOnLeaderboard: boolean
  /** IDs of finished games already counted on the server, newest last. */
  readonly reported: readonly string[]
  readonly challengeBest: number
}

export type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>
export type LoadStatus = 'ok' | 'recovered' | 'unavailable'

export function freshSave(): Save {
  return {
    version: VERSION, theme: 'system', tutorialSeen: false, daily: {}, practice: null, recentPractice: [],
    playerId: '', playerName: null, showOnLeaderboard: true, reported: [], challengeBest: 0,
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

const isBoolArray = (value: unknown, length: number): value is boolean[] =>
  Array.isArray(value) && value.length === length && value.every(item => typeof item === 'boolean')

/** Checks a stored game against its puzzle. Anything inconsistent is rejected rather than trusted. */
export function validateRecord(value: unknown, puzzle: Puzzle): GameRecord | undefined {
  const raw = asRecord(value)
  if (!raw || raw.puzzleId !== puzzle.id) return
  const { entries, hints, attempts, feedback } = raw
  const links = puzzle.gaps + 1

  if (!Array.isArray(entries) || entries.length !== puzzle.gaps) return
  if (!entries.every(entry => typeof entry === 'string' && entry.length <= MAX_ENTRY_LENGTH)) return

  if (!Array.isArray(attempts) || attempts.length > MAX_CHECKS) return
  const validAttempts: Attempt[] = []
  for (const item of attempts) {
    const attempt = asRecord(item)
    const words = attempt?.words
    if (!attempt || !Array.isArray(words) || words.length !== puzzle.gaps) return
    if (!words.every(word => typeof word === 'string' && isSingleWord(word))) return
    if (!isBoolArray(attempt.links, links)) return
    validAttempts.push({ words: [...words] as string[], links: [...attempt.links] })
  }
  // Nothing may follow a winning bridge.
  if (validAttempts.slice(0, -1).some(attempt => attempt.links.every(Boolean))) return

  if (!Array.isArray(hints) || hints.length > maxHints(puzzle)) return
  const validHints: Hint[] = []
  for (const item of hints) {
    const hint = asRecord(item)
    if (!hint || !Number.isInteger(hint.gap) || typeof hint.word !== 'string') return
    const gap = hint.gap as number
    if (gap < 0 || gap >= puzzle.gaps || validHints.some(other => other.gap === gap)) return
    // Hint words may come from community phrases that load after the save is read, so only their form is checked here.
    if (!isSingleWord(hint.word) || canonicalWord(GRAPH, normalizeEntry(entries[gap] as string)) !== hint.word) return
    validHints.push({ gap, word: hint.word })
  }

  const validFeedback: LinkFeedback[] =
    Array.isArray(feedback) && feedback.length === links && feedback.every(item => item === null || typeof item === 'boolean')
      ? [...feedback]
      : Array.from({ length: links }, () => null)

  const record: GameRecord = { puzzleId: puzzle.id, entries: [...entries] as string[], hints: validHints, attempts: validAttempts, feedback: validFeedback }
  return typeof raw.gameId === 'string' && GAME_ID.test(raw.gameId) ? { ...record, gameId: raw.gameId } : record
}

/** Decodes saved data. Unreadable or unknown-version data yields a fresh save; invalid individual games are dropped. */
export function decodeSave(raw: string | null): { save: Save; recovered: boolean } {
  const fallback = { save: freshSave(), recovered: raw !== null }
  if (raw === null) return { save: freshSave(), recovered: false }
  try {
    const value = asRecord(JSON.parse(raw))
    if (!value || value.version !== VERSION) return fallback

    const daily: Record<string, GameRecord> = {}
    for (const [key, entry] of Object.entries(asRecord(value.daily) ?? {})) {
      const day = Number(key)
      if (!Number.isSafeInteger(day) || day < FIRST_DAY || String(day) !== key) continue
      const puzzle = PUZZLE_BY_ID.get(dailyForDay(day).puzzleId)
      const record = puzzle && validateRecord(entry, puzzle)
      if (record) daily[key] = record
    }

    const practiceRaw = asRecord(value.practice)
    const practicePuzzle = typeof practiceRaw?.puzzleId === 'string' ? PUZZLE_BY_ID.get(practiceRaw.puzzleId) : undefined
    const practice = (practicePuzzle && validateRecord(practiceRaw, practicePuzzle)) || null

    const recents: unknown[] = Array.isArray(value.recentPractice) ? value.recentPractice : []
    const recentPractice = [...new Set(recents.filter((id): id is string => typeof id === 'string' && PUZZLE_BY_ID.has(id)))]
    if (practice && !recentPractice.includes(practice.puzzleId)) recentPractice.push(practice.puzzleId)

    return {
      save: {
        version: VERSION,
        theme: value.theme === 'dark' || value.theme === 'light' ? value.theme : 'system',
        tutorialSeen: value.tutorialSeen === true,
        daily,
        practice,
        recentPractice: recentPractice.slice(-PRACTICE_MEMORY),
        playerId: typeof value.playerId === 'string' && PLAYER_ID.test(value.playerId) ? value.playerId : '',
        playerName: typeof value.playerName === 'string' && value.playerName.trim().length >= 2 && value.playerName.length <= 20 ? value.playerName : null,
        showOnLeaderboard: value.showOnLeaderboard !== false,
        reported: (Array.isArray(value.reported) ? value.reported : []).filter((id): id is string => typeof id === 'string' && GAME_ID.test(id)).slice(-REPORTED_MEMORY),
        challengeBest: Number.isSafeInteger(value.challengeBest) && (value.challengeBest as number) > 0 ? value.challengeBest as number : 0,
      },
      recovered: false,
    }
  } catch {
    return fallback
  }
}

/** Loads saved progress. Never throws: blocked or corrupted storage still gives a playable game. */
export function loadSave(storage?: StorageAccess): { save: Save; status: LoadStatus } {
  let target: StorageAccess
  let raw: string | null
  try {
    target = storage ?? window.localStorage
    raw = target.getItem(STORAGE_KEY)
  } catch {
    return { save: freshSave(), status: 'unavailable' }
  }
  const { save, recovered } = decodeSave(raw)
  if (recovered && raw !== null) {
    // Keep a copy of the unreadable data instead of silently destroying it.
    try { target.setItem(BACKUP_KEY, raw) } catch { /* nothing else to do */ }
  }
  return { save, status: recovered ? 'recovered' : 'ok' }
}

export function writeSave(save: Save, storage?: StorageAccess): boolean {
  try {
    (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

/** Stores a daily game. A finished daily game is never replaced, so its result is recorded once. */
export function withDaily(save: Save, day: number, record: GameRecord): Save {
  const existing = save.daily[String(day)]
  if (existing && gameStatus(existing) !== 'playing') return save
  return { ...save, daily: { ...save.daily, [String(day)]: record } }
}

/** Resets progress but keeps the theme and leaderboard identity, and does not show the tutorial again. */
export function resetSave(save: Save): Save {
  return {
    ...freshSave(), theme: save.theme, tutorialSeen: true,
    playerId: save.playerId, playerName: save.playerName, showOnLeaderboard: save.showOnLeaderboard, reported: save.reported,
  }
}

/** The leaderboard ID of a finished game: one per daily date, or the practice game's random ID. */
export function gameKey(mode: 'daily' | 'practice', record: GameRecord, day?: number): string | null {
  if (mode === 'daily') return day === undefined ? null : `daily-${day}`
  return record.gameId ?? null
}

export function randomId(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return prefix + [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
