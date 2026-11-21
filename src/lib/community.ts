// Talks to the phrase service (worker/), which checks suggestions against Wiktionary and shares
// accepted phrases with every player. Its address is set at build time in .env.production.
// Without one, the game works exactly as before and suggestions can only be copied.

export const COMMUNITY_API: string = (import.meta.env?.VITE_COMMUNITY_API ?? '').trim().replace(/\/+$/, '')

export type SuggestStatus =
  | 'added' | 'exists' | 'invalid' | 'not-found' | 'offensive' | 'unfamiliar' | 'rate-limited' | 'error' | 'offline'

export type SuggestResult = { readonly status: SuggestStatus; readonly source?: string }

const SOURCE = /^[a-z]+[+ -][a-z]+$/

export async function request(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    return await fetch(`${COMMUNITY_API}${path}`, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Phrases added by players so far. Returns [] when the service is unavailable, so play continues offline. */
export async function fetchCommunityLinks(): Promise<string[]> {
  if (!COMMUNITY_API) return []
  try {
    const response = await request('/links')
    if (!response.ok) return []
    const body = (await response.json()) as { links?: unknown }
    return Array.isArray(body.links) ? body.links.filter((item): item is string => typeof item === 'string' && SOURCE.test(item)) : []
  } catch {
    return []
  }
}

const STATUSES: readonly SuggestStatus[] = ['added', 'exists', 'invalid', 'not-found', 'offensive', 'unfamiliar', 'rate-limited', 'error']

/** Sends FIRST + SECOND to be checked. Only call this for links the dictionary doesn't know. */
export async function suggestLink(from: string, to: string): Promise<SuggestResult> {
  if (!COMMUNITY_API) return { status: 'offline' }
  try {
    const response = await request('/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    })
    const body = (await response.json()) as { status?: unknown; source?: unknown }
    const status = STATUSES.find(item => item === body.status) ?? 'error'
    const source = typeof body.source === 'string' && SOURCE.test(body.source) ? body.source : undefined
    return source ? { status, source } : { status }
  } catch {
    return { status: 'offline' }
  }
}
