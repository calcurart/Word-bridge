import { ALIASES, LINK_NOTES, LINKS } from '../data/links.ts'
import { PUZZLES, TUTORIAL } from '../data/puzzles.ts'
import type { Puzzle } from '../data/puzzles.ts'
import { buildGraph, linkKey, parseLink } from './graph.ts'
import { findPaths } from './paths.ts'
import { DAILY_ERAS } from './schedule.ts'
import type { DailyEra } from './schedule.ts'

export type ContentInput = {
  readonly links: readonly string[]
  readonly notes: Readonly<Record<string, string>>
  readonly aliases: Readonly<Record<string, string>>
  readonly puzzles: readonly Puzzle[]
  readonly eras: readonly DailyEra[]
}

export type AuditReport = {
  readonly errors: string[]
  readonly warnings: string[]
  /** Number of valid bridges per puzzle (capped at SOLUTION_CAP). */
  readonly solutionCounts: ReadonlyMap<string, number>
  readonly summary: { links: number; words: number; puzzles: number; easy: number; standard: number }
}

const WORD = /^[a-z]+$/
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SOLUTION_CAP = 500
const GAPS_FOR: Record<Puzzle['difficulty'], number> = { easy: 2, standard: 3 }

const DEFAULT_INPUT: ContentInput = { links: LINKS, notes: LINK_NOTES, aliases: ALIASES, puzzles: PUZZLES, eras: DAILY_ERAS }

/** Checks the dictionary, puzzles and schedule for problems. Used by tests and `pnpm validate:content`. */
export function auditContent(input: ContentInput = DEFAULT_INPUT): AuditReport {
  const errors: string[] = []
  const warnings: string[] = []

  // Links
  const seen = new Set<string>()
  for (const source of input.links) {
    const link = parseLink(source)
    if (!link) { errors.push(`Link "${source}" is malformed (use "a+b", "a b" or "a-b" with lowercase letters).`); continue }
    if (link.from === link.to) errors.push(`Link "${source}" connects a word to itself.`)
    const key = linkKey(link.from, link.to)
    if (seen.has(key)) errors.push(`Link ${link.from.toUpperCase()} → ${link.to.toUpperCase()} is listed more than once.`)
    seen.add(key)
  }
  for (const key of Object.keys(input.notes)) {
    if (!seen.has(key)) errors.push(`Note "${key}" does not match any link.`)
  }

  const graph = buildGraph(input.links, input.notes, input.aliases)

  // Aliases
  for (const [variant, word] of Object.entries(input.aliases)) {
    if (!WORD.test(variant)) errors.push(`Alias "${variant}" must be lowercase letters.`)
    if (variant === word) errors.push(`Alias "${variant}" maps to itself.`)
    if (graph.words.has(variant)) errors.push(`Alias "${variant}" is ambiguous: it is also a word in the dictionary.`)
    if (!graph.words.has(word)) errors.push(`Alias "${variant}" points to "${word}", which is not in the dictionary.`)
    if (Object.hasOwn(input.aliases, word)) errors.push(`Alias "${variant}" points to another alias, "${word}".`)
  }

  // Puzzles
  const ids = new Set<string>()
  const routes = new Map<string, string>()
  const chains = new Map<string, string>()
  const solutionCounts = new Map<string, number>()
  for (const puzzle of input.puzzles) {
    const name = `Puzzle ${puzzle.id}`
    if (!ID.test(puzzle.id)) errors.push(`${name}: ID must be lowercase letters, digits and single hyphens.`)
    if (ids.has(puzzle.id)) errors.push(`${name}: duplicate ID.`)
    ids.add(puzzle.id)

    if (GAPS_FOR[puzzle.difficulty] !== puzzle.gaps) {
      errors.push(`${name}: ${puzzle.difficulty} puzzles need ${GAPS_FOR[puzzle.difficulty]} gaps, not ${puzzle.gaps}.`)
    }
    if (puzzle.solution.length !== puzzle.gaps) {
      errors.push(`${name}: solution has ${puzzle.solution.length} words but the puzzle has ${puzzle.gaps} gaps.`)
    }

    const chain = [puzzle.start, ...puzzle.solution, puzzle.end]
    for (const word of chain) {
      if (!WORD.test(word)) errors.push(`${name}: "${word}" must be lowercase letters.`)
      else if (!graph.words.has(word)) errors.push(`${name}: "${word}" is not in the dictionary.`)
    }
    if (new Set(chain).size !== chain.length) errors.push(`${name}: a word is repeated in the solution.`)
    for (let index = 0; index < chain.length - 1; index++) {
      if (!graph.links.has(linkKey(chain[index], chain[index + 1]))) {
        errors.push(`${name}: missing link ${chain[index].toUpperCase()} → ${chain[index + 1].toUpperCase()}.`)
      }
    }

    const route = `${puzzle.start}>${puzzle.end}/${puzzle.gaps}`
    const sameRoute = routes.get(route)
    if (sameRoute) errors.push(`${name}: same endpoints and length as ${sameRoute}.`)
    routes.set(route, puzzle.id)
    const sameChain = chains.get(chain.join(' '))
    if (sameChain) errors.push(`${name}: same solution as ${sameChain}.`)
    chains.set(chain.join(' '), puzzle.id)

    const count = findPaths(graph, puzzle.start, puzzle.end, puzzle.gaps, [], SOLUTION_CAP).length
    solutionCounts.set(puzzle.id, count)
    if (count === 0) errors.push(`${name}: no bridge of ${puzzle.gaps} words connects the endpoints.`)
  }

  // Tutorial
  const tutorial = [TUTORIAL.start, ...TUTORIAL.solution, TUTORIAL.end]
  for (let index = 0; index < tutorial.length - 1; index++) {
    if (!graph.links.has(linkKey(tutorial[index], tutorial[index + 1]))) errors.push(`Tutorial: missing link ${tutorial[index]} → ${tutorial[index + 1]}.`)
  }
  if (graph.links.has(linkKey('pot', 'flower'))) errors.push('Tutorial says POT → FLOWER does not count, but that link exists.')

  // Schedule
  if (input.eras.length === 0) errors.push('Schedule: there must be at least one daily era.')
  const scheduled = new Set<string>()
  input.eras.forEach((era, eraIndex) => {
    if (eraIndex > 0 && era.start <= input.eras[eraIndex - 1].start) errors.push(`Schedule: era ${eraIndex + 1} must start after era ${eraIndex}.`)
    if (era.order.length === 0) errors.push(`Schedule: era ${eraIndex + 1} is empty.`)
    const inEra = new Set<string>()
    for (const id of era.order) {
      if (!ids.has(id)) errors.push(`Schedule: era ${eraIndex + 1} lists unknown puzzle "${id}".`)
      if (inEra.has(id)) errors.push(`Schedule: era ${eraIndex + 1} lists "${id}" twice.`)
      inEra.add(id)
      scheduled.add(id)
    }
  })
  for (const id of ids) if (!scheduled.has(id)) warnings.push(`Puzzle ${id} is not in the daily schedule (practice only).`)

  return {
    errors,
    warnings,
    solutionCounts,
    summary: {
      links: graph.links.size,
      words: graph.words.size,
      puzzles: input.puzzles.length,
      easy: input.puzzles.filter(puzzle => puzzle.difficulty === 'easy').length,
      standard: input.puzzles.filter(puzzle => puzzle.difficulty === 'standard').length,
    },
  }
}
