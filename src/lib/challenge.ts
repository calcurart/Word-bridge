// Challenge mode rules. Shared by the game and by the server, which re-scores submitted runs.
//
// The player sees a word (e.g. FOREST) and types a word that makes a familiar word or phrase with it,
// before or after it (RAIN -> rainforest, FIRE -> forest fire). Each correct answer scores a point and
// usually becomes the next word. A word can be used only once per run.
import { canonicalWord, findLink, isSingleWord, normalizeEntry } from './graph.ts'
import type { Link, WordGraph } from './graph.ts'

export const CHALLENGE_SECONDS = 300
export const SKIP_PENALTY_SECONDS = 10
/** More than this many answers in five minutes would be one every 1.5 seconds; anything beyond is rejected. */
export const MAX_ANSWERS = 200
/** A word is a good prompt when it has at least this many connections in either direction. */
const PROMPT_CONNECTIONS = 4

/** Every word that makes a phrase with `word`, in either order. */
export function connections(graph: WordGraph, word: string): string[] {
  return [...new Set([...(graph.next.get(word) ?? []), ...(graph.previous.get(word) ?? [])])]
}

/** Words that make fair prompts: well connected, so there is always more than one way to score. */
export function promptPool(graph: WordGraph): string[] {
  return [...graph.words].filter(word => connections(graph, word).length >= PROMPT_CONNECTIONS).sort()
}

export function pickPrompt(graph: WordGraph, used: ReadonlySet<string>, random: () => number = Math.random): string {
  const pool = promptPool(graph)
  const fresh = pool.filter(word => !used.has(word))
  const choices = fresh.length > 0 ? fresh : pool
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
}

/** The answer becomes the next prompt when it still has at least two unused connections; otherwise a fresh word. */
export function nextPrompt(graph: WordGraph, answer: string, used: ReadonlySet<string>, random: () => number = Math.random): string {
  const open = connections(graph, answer).filter(word => !used.has(word))
  return open.length >= 2 ? answer : pickPrompt(graph, used, random)
}

export type AnswerCheck =
  | { readonly ok: true; readonly word: string; readonly link: Link }
  | { readonly ok: false; readonly reason: 'empty' | 'not-one-word' | 'same' | 'used' | 'unknown' }

/** Checks one answer against the prompt. `used` holds every word already shown or answered in this run. */
export function checkAnswer(graph: WordGraph, prompt: string, raw: string, used: ReadonlySet<string>): AnswerCheck {
  const normalized = normalizeEntry(raw)
  if (normalized === '') return { ok: false, reason: 'empty' }
  if (!isSingleWord(normalized)) return { ok: false, reason: 'not-one-word' }
  const word = canonicalWord(graph, normalized)
  if (word === prompt) return { ok: false, reason: 'same' }
  if (used.has(word)) return { ok: false, reason: 'used' }
  const link = findLink(graph, prompt, word) ?? findLink(graph, word, prompt)
  return link ? { ok: true, word, link } : { ok: false, reason: 'unknown' }
}

/**
 * Recounts a finished run from its (prompt, answer) pairs. Invalid or repeated answers score nothing,
 * so the result can be trusted no matter what the browser claimed.
 */
export function scoreAnswers(graph: WordGraph, pairs: readonly (readonly [string, string])[]): number {
  const used = new Set<string>()
  let score = 0
  for (const [prompt, answer] of pairs.slice(0, MAX_ANSWERS)) {
    if (typeof prompt !== 'string' || typeof answer !== 'string' || !isSingleWord(prompt)) continue
    used.add(prompt)
    const result = checkAnswer(graph, prompt, answer, used)
    if (!result.ok) continue
    used.add(result.word)
    score++
  }
  return score
}

/** "4:05" style clock. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
