export const DAY_MS = 86_400_000

/** Daily Bridge #1 is played on this UTC date. Never change it once released. */
export const FIRST_DATE = '2026-11-18'

/** Whole UTC days since 1970-01-01. Every player sees the same day number at the same moment. */
export function utcDay(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS)
}

export const FIRST_DAY = utcDay(Date.parse(`${FIRST_DATE}T00:00:00Z`))

// The daily puzzle for a date depends only on FIRST_DATE and DAILY_ERAS, never on
// the order of PUZZLES, so editing or adding puzzles cannot move a past assignment.
//
// This order is frozen. Never reorder, remove or replace entries. To bring new
// puzzles into the daily rotation, append a new era whose `start` day is in the
// future (see README › Preserving the daily schedule). Earlier dates keep their era.
export const ORIGINAL_ORDER: readonly string[] = [
  'flash-fright', 'rain-shop', 'tooth-dog', 'cow-mint', 'race-office', 'key-mate', 'star-hat', 'sea-dust',
  'pop-crumb', 'head-chair', 'bull-bone', 'dragon-bell', 'goal-room', 'black-robe', 'snow-press', 'wall-board',
  'pine-cake', 'day-court', 'picnic-game', 'finger-file', 'drum-center', 'cross-floor', 'small-question',
  'egg-bowl', 'table-stick', 'red-room', 'pass-bulb', 'wind-flower', 'home-way', 'school-post', 'ice-cake',
  'tea-way', 'salt-case', 'back-link', 'night-pot', 'under-bug', 'life-trip', 'coffee-line', 'jelly-work',
  'gold-bag', 'wood-show', 'lumber-punch', 'water-ladder', 'swim-study', 'ear-hole', 'car-buckle', 'arm-life',
  'green-race', 'cart-lift', 'hair-mat', 'mouse-knob', 'sand-dream', 'moon-mark', 'sweet-dressing', 'hot-show',
  'birth-line', 'chocolate-tag', 'news-ship', 'peanut-board', 'foot-smith', 'fire-work', 'touch-hold',
  'honey-house', 'book-house', 'tissue-bone', 'shoe-bag', 'eye-service', 'bed-cloth', 'junk-hole',
]

export type DailyEra = { readonly start: number; readonly order: readonly string[] }

/** Each era cycles its own order from its start day. Eras must be sorted by start day. */
export const DAILY_ERAS: readonly DailyEra[] = [
  { start: FIRST_DAY, order: ORIGINAL_ORDER },
]

export type DailyAssignment = { readonly day: number; readonly number: number; readonly puzzleId: string }

export function dailyForDay(day: number, eras: readonly DailyEra[] = DAILY_ERAS): DailyAssignment {
  const puzzleDay = Math.max(day, eras[0].start)
  const era = eras.findLast(entry => entry.start <= puzzleDay) ?? eras[0]
  return {
    day: puzzleDay,
    number: puzzleDay - eras[0].start + 1,
    puzzleId: era.order[(puzzleDay - era.start) % era.order.length],
  }
}

export function timeUntilNextDay(timestamp: number): number {
  return (utcDay(timestamp) + 1) * DAY_MS - timestamp
}

/** "05:07:09" style countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
  return parts.map(part => String(part).padStart(2, '0')).join(':')
}
