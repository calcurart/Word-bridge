// Decides whether a suggested pair (FIRST then SECOND) is a real, suitable English word or phrase,
// using Wiktionary page source (wikitext). Pure functions: no network access, so they can be tested.

export type Verdict =
  | { readonly ok: true; readonly source: string; readonly title: string }
  | { readonly ok: false; readonly reason: 'invalid' | 'not-found' | 'offensive' | 'unfamiliar' }

/** 'alternative': a real entry whose senses are all "alternative form of …" another spelling. */
export type Assessment = 'ok' | 'alternative' | 'offensive' | 'unfamiliar' | 'not-english'

const ALTERNATIVE = /\{\{(?:alternative form of|alt form|alt-form|alternative spelling of|alt sp|alternative case form of)\|/i

export const WORD = /^[a-z]{2,15}$/

// Exact words that are never added, whatever the dictionary says. Slurs are also caught by
// Wiktionary's "offensive"/"derogatory"/"slur" labels below.
const BLOCKED_WORDS = new Set([
  'arse', 'ass', 'bastard', 'bitch', 'bollocks', 'boob', 'boobs', 'cock', 'crap', 'cunt', 'damn', 'dick', 'dildo',
  'fag', 'fuck', 'hell', 'jizz', 'nazi', 'penis', 'piss', 'porn', 'prick', 'pussy', 'rape', 'sex', 'sexy', 'shit',
  'slut', 'tit', 'tits', 'twat', 'vagina', 'wank', 'whore',
])

// Parts of speech that make a usable game link. "Proper noun" (names, brands, places) is deliberately absent.
const PARTS_OF_SPEECH = /^(noun|verb|adjective|adverb|phrase|idiom|proverb|interjection|prepositional phrase)$/i

const OFFENSIVE = /\b(vulgar|offensive|derogatory|slur|pejorative|obscene|profane|profanity|sexual slang|ethnic|racist)\b/i
// A definition is "unfamiliar" when it is marked archaic/rare/etc. or is only a misspelling or obsolete form.
const UNFAMILIAR = /\{\{(?:lb|lbl|label)\|en\|[^}]*\b(archaic|obsolete|dated|rare|nonstandard|dialectal|dialect|historical|uncommon|nonce)\b|\{\{(?:misspelling of|obsolete form of|obsolete spelling of|archaic form of|archaic spelling of|rare form of|rare spelling of|nonstandard form of|nonstandard spelling of)\|/i

/** The page titles to look up, in order of preference, with the link source each would produce. */
export function candidates(from: string, to: string): { title: string; source: string }[] {
  return [
    { title: `${from}${to}`, source: `${from}+${to}` },
    { title: `${from} ${to}`, source: `${from} ${to}` },
    { title: `${from}-${to}`, source: `${from}-${to}` },
  ]
}

/** The ==English== section of a Wiktionary page, or null when the page has none. */
export function englishSection(wikitext: string): string | null {
  const match = /(?:^|\n)==\s*English\s*==\s*\n([\s\S]*?)(?=\n==[^=]|$)/.exec(wikitext)
  return match ? match[1] : null
}

export function assessEntry(wikitext: string): Assessment {
  const english = englishSection(wikitext)
  if (english === null) return 'not-english'

  // Keep only the parts of the section under an accepted part-of-speech heading.
  const parts: string[] = []
  let keep = false
  for (const line of english.split('\n')) {
    const heading = /^(={3,5})\s*([^=]+?)\s*\1\s*$/.exec(line)
    if (heading) {
      keep = PARTS_OF_SPEECH.test(heading[2])
      continue
    }
    if (keep) parts.push(line)
  }
  const definitions = parts.filter(line => /^##?\s/.test(line))
  if (definitions.length === 0) return 'not-english'
  if (definitions.some(line => OFFENSIVE.test(line))) return 'offensive'
  if (definitions.every(line => UNFAMILIAR.test(line))) return 'unfamiliar'
  if (definitions.every(line => ALTERNATIVE.test(line))) return 'alternative'
  return 'ok'
}

/**
 * Judges a pair from the looked-up pages (title -> wikitext, or null when the page doesn't exist).
 * Any offensive form rejects the pair; otherwise the first main entry (closed, open, hyphenated) wins,
 * then the first alternative-spelling entry.
 */
export function judge(from: string, to: string, pages: ReadonlyMap<string, string | null>): Verdict {
  if (!WORD.test(from) || !WORD.test(to) || from === to) return { ok: false, reason: 'invalid' }
  if (BLOCKED_WORDS.has(from) || BLOCKED_WORDS.has(to) || BLOCKED_WORDS.has(from + to)) return { ok: false, reason: 'offensive' }

  const found = candidates(from, to).flatMap(candidate => {
    const text = pages.get(candidate.title)
    return text == null ? [] : [{ ...candidate, assessment: assessEntry(text) }]
  })
  if (found.some(entry => entry.assessment === 'offensive')) return { ok: false, reason: 'offensive' }
  // Prefer the main spelling (e.g. "side table") over a form listed only as its alternative ("sidetable").
  const good = found.find(entry => entry.assessment === 'ok') ?? found.find(entry => entry.assessment === 'alternative')
  if (good) return { ok: true, source: good.source, title: good.title }
  return { ok: false, reason: found.some(entry => entry.assessment === 'unfamiliar') ? 'unfamiliar' : 'not-found' }
}

/** One Wiktionary Action API request that fetches all candidate pages at once. */
export function wiktionaryUrl(from: string, to: string): string {
  const params = new URLSearchParams({
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
    format: 'json', formatversion: '2', titles: candidates(from, to).map(c => c.title).join('|'),
  })
  return `https://en.wiktionary.org/w/api.php?${params}`
}

type QueryResponse = {
  query?: { pages?: { title: string; missing?: boolean; revisions?: { slots?: { main?: { content?: string } } }[] }[] }
}

/** Turns the API response into title -> wikitext (null for missing pages). */
export function parsePages(json: unknown): Map<string, string | null> {
  const pages = new Map<string, string | null>()
  for (const page of (json as QueryResponse).query?.pages ?? []) {
    pages.set(page.title, page.missing ? null : page.revisions?.[0]?.slots?.main?.content ?? null)
  }
  return pages
}
