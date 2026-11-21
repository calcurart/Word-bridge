// Challenge rules and scoring, used by the server. Pure functions over the dictionary text, so they can be tested.
//
// SINGLE: the player sees a word (FOREST) and types one word that comes AFTER it (FIRE -> "forest fire").
// DOUBLE: the player types two words, one BEFORE and one AFTER it (RAIN, FIRE -> "rainforest" + "forest fire").
// A link counts whether it's written joined (sunflower), spaced (forest fire) or hyphenated.
//
// Each word scores 10 (obvious) to 100 (nearly impossible). It starts from how common the phrase is in
// written English (the dictionary's base score) and moves toward how rarely other players give the same
// answer to the same prompt, like Krillion: the more players have answered a prompt, the more their answers count.

export type Mode = 'single' | 'double'
export type Slot = 'before' | 'after'
export type Form = 'c' | 's' | 'h'
export type Entry = { readonly form: Form; readonly base: number }

export type Dictionary = {
  readonly links: ReadonlyMap<string, ReadonlyMap<string, Entry>>
  /** Standalone English words. Every answer must be one of these. */
  readonly words: ReadonlySet<string>
  readonly prompts: Readonly<Record<Mode, readonly string[]>>
  readonly size: number
}

export const MIN_POINTS = 10
export const MAX_POINTS = 100
/** Base score for links found only by a live dictionary lookup (not in the built list). */
export const LIVE_WIKTIONARY_BASE = 85
export const URBAN_BASE = 95
/** Above this share of players giving the same answer, it scores the minimum. */
const OBVIOUS_SHARE = 0.25
/** How many answers to a prompt before players' choices count as much as the base score. */
const CROWD_HALF = 20

export function parseDictionary(text: string, wordsText = ''): Dictionary {
  const links = new Map<string, Map<string, Entry>>()
  const prompts: Record<Mode, string[]> = { single: [], double: [] }
  let size = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('#single ')) { prompts.single = line.slice(8).split(' ').filter(Boolean); continue }
    if (line.startsWith('#double ')) { prompts.double = line.slice(8).split(' ').filter(Boolean); continue }
    if (line === '' || line.startsWith('#')) continue
    const [a, b, form, base] = line.split(' ')
    let next = links.get(a)
    if (!next) links.set(a, (next = new Map()))
    next.set(b, { form: form as Form, base: Number(base) })
    size++
  }
  const words = new Set(wordsText.split(/\s+/).filter(Boolean))
  return { links, prompts, size, words }
}

export function lookup(dictionary: Dictionary, first: string, second: string): Entry | undefined {
  return dictionary.links.get(first)?.get(second)
}

export function phraseOf(first: string, second: string, form: Form): string {
  return form === 'c' ? first + second : form === 'h' ? `${first}-${second}` : `${first} ${second}`
}

/** Lowercase letters only, or null. Players type one word per box. */
export function normalizeWord(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const word = raw.normalize('NFKC').trim().toLowerCase()
  return /^[a-z]{1,30}$/.test(word) ? word : null
}

/**
 * Points for an answer. `picks` is how many earlier answers to this prompt (in this slot) were the same word,
 * `total` how many answers to this prompt there have been in all.
 */
export function points(base: number, picks: number, total: number): number {
  const clamp = (value: number) => Math.max(MIN_POINTS, Math.min(MAX_POINTS, Math.round(value)))
  if (total <= 0) return clamp(base)
  const crowd = MIN_POINTS + (MAX_POINTS - MIN_POINTS) * Math.max(0, 1 - picks / total / OBVIOUS_SHARE)
  const weight = total / (total + CROWD_HALF)
  return clamp((1 - weight) * base + weight * crowd)
}

export function pickPrompt(dictionary: Dictionary, mode: Mode, used: ReadonlySet<string>, random: () => number = Math.random): string {
  const pool = dictionary.prompts[mode]
  const fresh = pool.filter(word => !used.has(word))
  const choices = fresh.length > 0 ? fresh : pool
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
}

/** The word typed after the prompt becomes the next prompt when it's a good prompt itself; otherwise a fresh one. */
export function nextPrompt(dictionary: Dictionary, mode: Mode, after: string, used: ReadonlySet<string>, random: () => number = Math.random): string {
  return dictionary.prompts[mode].includes(after) && !used.has(after) ? after : pickPrompt(dictionary, mode, used, random)
}

export type WordCheck =
  | { readonly ok: true; readonly word: string }
  | { readonly ok: false; readonly reason: 'missing' | 'not-one-word' | 'not-a-word' | 'same' | 'used' | 'same-pair' }

/** Format checks before any dictionary lookup. */
export function checkWords(mode: Mode, prompt: string, used: ReadonlySet<string>, raw: { before?: unknown; after?: unknown }, words: ReadonlySet<string>) {
  const one = (value: unknown): WordCheck => {
    if (typeof value !== 'string' || value.trim() === '') return { ok: false, reason: 'missing' }
    const word = normalizeWord(value)
    if (!word) return { ok: false, reason: 'not-one-word' }
    if (!words.has(word)) return { ok: false, reason: 'not-a-word' }
    if (word === prompt) return { ok: false, reason: 'same' }
    if (used.has(word)) return { ok: false, reason: 'used' }
    return { ok: true, word }
  }
  const after = one(raw.after)
  if (mode === 'single') return { after }
  let before = one(raw.before)
  if (before.ok && after.ok && before.word === after.word) before = { ok: false, reason: 'same-pair' }
  return { before, after }
}
