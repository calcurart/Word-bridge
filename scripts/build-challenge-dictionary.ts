// Builds worker/data/challenge-words.txt, the large dictionary used by Challenge mode (Single and Double).
//
// Usage:
//   node scripts/build-challenge-dictionary.ts <wiktionary-dir> <count_1w.txt> <count_2w.txt>
//
// Inputs (not stored in the repo; see README › Challenge dictionary):
//   <wiktionary-dir>/English_compound_terms.json      page titles in Wiktionary's "English compound terms"
//   <wiktionary-dir>/English_multiword_terms.json     page titles in "English multiword terms"
//   <wiktionary-dir>/English_{vulgarities,offensive_terms,ethnic_slurs,derogatory_terms,swear_words}.json  excluded
//   count_1w.txt / count_2w.txt                        Peter Norvig's word and two-word counts (Google web text)
//   titles.gz (optional)                               Wikimedia's enwiktionary-latest-all-titles-in-ns0.gz: every page
//                                                      title; two-word titles of everyday English words are added
//
// Output: one line per link "first second form base", where form is c (joined, "sunflower"), s (spaced,
// "forest fire") or h (hyphenated), and base is the starting rarity: 10 (very common) to 100 (very rare).
// Two header lines list good prompt words for Single and Double.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { COMMUNITY_LINKS } from '../src/data/community-links.ts'
import { LINKS } from '../src/data/links.ts'
import { parseLink } from '../src/lib/graph.ts'
import { BLOCKED_WORDS } from '../worker/src/verify.ts'

const [dir, file1, file2, titlesFile] = process.argv.slice(2)
if (!dir || !file1 || !file2) {
  console.error('Usage: node scripts/build-challenge-dictionary.ts <wiktionary-dir> <count_1w.txt> <count_2w.txt>')
  process.exit(1)
}

const readList = (name: string): string[] => {
  const file = join(dir, `${name}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  // A list that is still being fetched: use what has arrived so far.
  const partial = join(dir, `${name}.partial.json`)
  if (existsSync(partial)) {
    const titles: string[] = JSON.parse(readFileSync(partial, 'utf8')).titles
    console.warn(`note: ${name} is incomplete (${titles.length} titles so far)`)
    return titles
  }
  throw new Error(`missing ${file}`)
}
const readCounts = (file: string) => {
  const counts = new Map<string, number>()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const tab = line.indexOf('\t')
    if (tab > 0) counts.set(line.slice(0, tab), Number(line.slice(tab + 1)))
  }
  return counts
}
const count1 = readCounts(file1)
const count2 = readCounts(file2)
const rank1 = new Map([...count1.keys()].map((word, index) => [word, index]))

// A phrase Wiktionary labels vulgar, offensive, derogatory or a slur is left out. Single words only block a pair
// when they are slurs or strongly offensive: many everyday words (box, hole, ball) also have a vulgar slang sense.
const offensive = new Set<string>()
for (const name of ['English_vulgarities', 'English_offensive_terms', 'English_ethnic_slurs', 'English_derogatory_terms', 'English_swear_words']) {
  for (const title of readList(name)) offensive.add(title.toLowerCase())
}
const blockedParts = new Set<string>([...BLOCKED_WORDS, ...readList('English_ethnic_slurs').map(title => title.toLowerCase()), ...readList('English_swear_words').map(title => title.toLowerCase())])

const WORD = /^[a-z]{2,20}$/
type Form = 'c' | 's' | 'h'
type Entry = { forms: Set<Form>; frequency: number; curated: boolean }
const entries = new Map<string, Entry>()

function frequencyOf(a: string, b: string): number {
  // Two-word counts run lower than single-word counts for equally familiar items, so they are scaled up.
  return Math.max(count1.get(a + b) ?? 0, (count2.get(`${a} ${b}`) ?? 0) * 8, count1.get(`${a}-${b}`) ?? 0)
}

/** True while adding from curated sources (compound terms, multiword terms, the game's own links). */
let curatedSource = true

function add(a: string, b: string, form: Form) {
  if (!WORD.test(a) || !WORD.test(b) || a === b) return
  if (blockedParts.has(a) || blockedParts.has(b) || offensive.has(a + b) || offensive.has(`${a} ${b}`) || offensive.has(`${a}-${b}`)) return
  const key = `${a} ${b}`
  const entry = entries.get(key) ?? { forms: new Set<Form>(), frequency: frequencyOf(a, b), curated: false }
  entry.forms.add(form)
  entry.curated ||= curatedSource
  entries.set(key, entry)
}

const SHORT = new Set(['up', 'in', 'on', 'ox', 'ax', 'go', 'me', 'by', 'do', 'no', 'so', 'to', 'we', 'he', 'it', 'at', 'an', 'as', 'be', 'my', 'of', 'or', 'us'])

/** Splits a joined word into two words, preferring the split whose rarer half is most common. */
function split(word: string, minPart: number): [string, string] | null {
  let best: [string, string] | null = null
  let bestScore = -1
  for (let i = minPart; i <= word.length - minPart; i++) {
    const a = word.slice(0, i)
    const b = word.slice(i)
    const ra = rank1.get(a)
    const rb = rank1.get(b)
    if (ra === undefined || rb === undefined || ra > 40_000 || rb > 40_000) continue
    if ((a.length === 2 && !SHORT.has(a)) || (b.length === 2 && !SHORT.has(b))) continue
    const score = Math.min(count1.get(a)!, count1.get(b)!)
    if (score > bestScore) { best = [a, b]; bestScore = score }
  }
  return best
}

function addTitle(title: string, minPart: number) {
  if (/^[a-z]+ [a-z]+$/.test(title)) {
    const [a, b] = title.split(' ')
    // Both words must be everyday English (this drops Latin and other borrowed phrases).
    if ((rank1.get(a) ?? Infinity) <= 100_000 && (rank1.get(b) ?? Infinity) <= 100_000) add(a, b, 's')
  } else if (/^[a-z]+-[a-z]+$/.test(title)) {
    const [a, b] = title.split('-')
    if ((rank1.get(a) ?? Infinity) <= 100_000 && (rank1.get(b) ?? Infinity) <= 100_000) add(a, b, 'h')
  } else if (/^[a-z]{4,}$/.test(title)) {
    const parts = split(title, minPart)
    if (parts) add(parts[0], parts[1], 'c')
  }
}

for (const title of readList('English_compound_terms')) addTitle(title, 2)
for (const title of readList('English_multiword_terms')) if (/^[a-z]+[ -][a-z]+$/.test(title)) addTitle(title, 2)

// All two-word Wiktionary titles (every language), kept when both words are everyday English and the phrase
// is either in English web text or made of two very common English words.
if (titlesFile) {
  curatedSource = false
  let kept = 0
  for (const line of gunzipSync(readFileSync(titlesFile)).toString('utf8').split(String.fromCharCode(10))) {
    if (!/^[a-z]+_[a-z]+$/.test(line)) continue
    const [a, b] = line.split('_')
    const ra = rank1.get(a) ?? Infinity
    const rb = rank1.get(b) ?? Infinity
    if (ra > 60_000 || rb > 60_000) continue
    if (count2.has(`${a} ${b}`) || (ra <= 15_000 && rb <= 15_000)) { add(a, b, 's'); kept++ }
  }
  console.log(`two-word titles kept from the title list: ${kept}`)
}
for (const source of [...LINKS, ...COMMUNITY_LINKS]) {
  const link = parseLink(source)
  if (link) add(link.from, link.to, source.includes('+') ? 'c' : source.includes('-') ? 'h' : 's')
}

// Starting rarity from frequency: the percentile among all entries that have a count, mapped to 10..80.
// The top of the scale (up to 100) is left for what players show: answers nobody else gives.
// Phrases missing from the web counts are estimated from their two words: made of very common words, a phrase is
// probably fairly familiar (50); made of rarer words, it's genuinely rare (up to 80).
const counted = [...entries.values()].filter(entry => entry.frequency > 0).map(entry => entry.frequency).sort((x, y) => y - x)
const percentile = (frequency: number) => {
  let low = 0
  let high = counted.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (counted[mid] > frequency) low = mid + 1
    else high = mid
  }
  return low / Math.max(1, counted.length - 1)
}
const base = (entry: Entry, key: string) => {
  if (entry.frequency > 0) return Math.round(10 + 70 * Math.pow(percentile(entry.frequency), 1.3))
  const [a, b] = key.split(' ')
  const worst = Math.max(rank1.get(a) ?? 333_000, rank1.get(b) ?? 333_000)
  return worst < 5_000 ? 50 : worst < 15_000 ? 60 : worst < 40_000 ? 70 : 80
}

// Prompt words: common, not a tiny function word, and with plenty of answers.
const STOP = new Set('the of and to in is it for on with as by at an be this that from or are was not but have has had his her its our their your you we they he she him them me my so if no do does did can could would should will may might must shall than then there here what when where which who whom why how all any some each every one two three up out off over under into onto about'.split(' '))
const next = new Map<string, number>()
const previous = new Map<string, number>()
for (const [key, entry] of entries) {
  if (!entry.curated) continue
  const [a, b] = key.split(' ')
  next.set(a, (next.get(a) ?? 0) + 1)
  previous.set(b, (previous.get(b) ?? 0) + 1)
}
const promptable = (word: string) => !/(ed|ing)$/.test(word) && !STOP.has(word) && word.length >= 3 && (rank1.get(word) ?? Infinity) < 15_000 && !offensive.has(word) && !blockedParts.has(word)
const single = [...next.entries()].filter(([word, n]) => n >= 8 && promptable(word)).map(([word]) => word).sort()
const double = [...next.keys()].filter(word => (next.get(word) ?? 0) >= 4 && (previous.get(word) ?? 0) >= 4 && promptable(word)).sort()

const lines = [
  '# Word Bridge challenge dictionary. Generated by scripts/build-challenge-dictionary.ts; do not edit by hand.',
  `#single ${single.join(' ')}`,
  `#double ${double.join(' ')}`,
  ...[...entries.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([key, entry]) => {
    const form: Form = entry.forms.has('c') ? 'c' : entry.forms.has('s') ? 's' : 'h'
    // Prefer whichever written form is more common for display.
    const [a, b] = key.split(' ')
    const display: Form = entry.forms.has('c') && entry.forms.has('s')
      ? ((count1.get(a + b) ?? 0) >= (count2.get(key) ?? 0) * 8 ? 'c' : 's')
      : form
    return `${key} ${display} ${base(entry, key)}`
  }),
]
writeFileSync(new URL('../worker/data/challenge-words.txt', import.meta.url), lines.join('\n') + '\n')

const scores = [...entries.entries()].map(([key, entry]) => base(entry, key)).sort((x, y) => x - y)
const at = (q: number) => scores[Math.floor(q * (scores.length - 1))]
console.log(`links: ${entries.size}; single prompts: ${single.length}; double prompts: ${double.length}`)
console.log(`base rarity percentiles: 10%=${at(0.1)} 25%=${at(0.25)} 50%=${at(0.5)} 75%=${at(0.75)} 90%=${at(0.9)}`)
for (const sample of ['sun flower', 'forest fire', 'fire work', 'rain forest', 'tooth brush', 'hole punch', 'fire alarm']) {
  const entry = entries.get(sample)
  console.log(`  ${sample}: ${entry ? `${[...entry.forms].join('')} base ${base(entry, sample)}` : 'missing'}`)
}
