// Urban Dictionary fallback for modern words and slang that Wiktionary doesn't have yet.
// Pure functions; the request is made in challenge-api.ts.
//
// The public API no longer reports vote counts, so a term is accepted when several different people have
// defined it (a sign it's real, shared slang rather than a joke or a one-off), most of those definitions
// aren't crude, and the term itself isn't crude.

export function urbanUrl(term: string): string {
  return `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`
}

const CRUDE = /\b(fuck\w*|shit\w*|cunts?|cocks?|dicks?|puss(?:y|ies)|penis\w*|vagina\w*|sex|sexual\w*|sexy|porn\w*|anal|cum|jizz|nigg\w*|fags?|faggot\w*|retard\w*|rap(?:e|es|ed|ing)|whores?|sluts?|tits|boobs?|masturbat\w*|orgasm\w*|horny|nude|naked|dildo\w*|erection\w*|blowjob\w*|semen|testicles?|asshole\w*|bitch\w*|genital\w*|hooker\w*|stripper\w*|cocaine|meth)\b/i
const MIN_DEFINITIONS = 3

type UrbanEntry = { word?: unknown; definition?: unknown; author?: unknown }

const plain = (value: unknown) => (typeof value === 'string' ? value.toLowerCase().replace(/[^a-z -]/g, '').trim() : '')

/** True when several people have defined exactly this term and most definitions are clean. */
export function judgeUrban(term: string, json: unknown): boolean {
  const list = (json as { list?: UrbanEntry[] } | null)?.list
  if (!Array.isArray(list) || CRUDE.test(term)) return false
  const matches = list.filter(entry => plain(entry.word) === term && typeof entry.definition === 'string')
  const authors = new Set(matches.map(entry => String(entry.author ?? '')))
  if (matches.length < MIN_DEFINITIONS || authors.size < MIN_DEFINITIONS) return false
  const clean = matches.filter(entry => !CRUDE.test(entry.definition as string)).length
  return clean * 3 >= matches.length * 2
}
