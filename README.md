# Word Bridge

A daily word puzzle. Connect two words by filling in the missing words between them. Each neighboring pair must
make a familiar compound word or phrase, read left to right.

```
SUN → [ FLOWER ] → [ POT ] → HOLE
      sunflower   flower pot   pothole
```

React 19 + TypeScript (strict) + Vite 7. No backend, no accounts, no analytics, no external services: it builds to a
folder of static files.

## Run it

Requires Node 22.18+ (for native TypeScript in tests and scripts) and pnpm.

```powershell
pnpm install
```

```powershell
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm dev` | Local dev server with hot reload |
| `pnpm test` | Unit tests (`node --test`, no extra test framework) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm validate:content` | Checks the dictionary, puzzles and schedule; exits 1 on any error |
| `pnpm build` | Typecheck + content validation + production build into `dist/` |
| `pnpm preview` | Serves the built `dist/` locally |

If `pnpm` isn't installed, `npx --yes pnpm@11 <command>` works too.

## Deploy

The site is published with **GitHub Pages** by `.github/workflows/deploy.yml`. Every push to `main` runs the tests and
the production build on GitHub, then publishes `dist/`. There are no secrets; the only setting is the public address
of the phrase service in `.env.production`. One-time setup (already done for this repository): *Settings › Pages › Source: GitHub Actions*.

To publish a change: commit it and push to `main`, then watch the **Actions** tab; the site updates a minute or two
after the run turns green. If the tests or build fail, the old version stays online.

Any other static host works as well: `pnpm build`, then upload the contents of `dist/` (Netlify, Cloudflare Pages, S3, a
plain web server). The build uses relative asset paths (`base: './'`), so it also works from a subfolder. No server
configuration or environment variables are needed.

## How to play

- Fill the gaps. Each neighboring pair makes a familiar word or phrase.
- Standard puzzles have 3 missing words (4 links); easy puzzles have 2 (3 links).
- Each gap holds one word. Capitals and surrounding spaces don't matter. Supported spelling variants
  (e.g. CENTRE for CENTER) are accepted.
- **Check Bridge** evaluates the whole bridge. You get 5 checks. Incomplete bridges, and a bridge identical to one
  already checked (after normalising), don't use a check.
- After a check, each **link** (not each word) is marked ✓ with the phrase it makes, or ✕ *Not in this game's
  dictionary*. A word can be right on one side and wrong on the other, so nothing is locked. Editing a word clears
  the feedback on its two neighboring links, because that feedback described the old word.
- Any bridge whose links are all in the dictionary wins, not just the intended answer.
- Up to two hints (one on easy puzzles, so a gap is always left to you). A hint reveals a word and fixes it in place;
  it doesn't use a check but is shown in the result.
- After five unsuccessful checks the game shows **One possible solution**, consistent with any hints you took.
- Unrecognised links have a **Suggest** action. The phrase is looked up in Wiktionary and, if it's a real English
  word or phrase, added to the game for everyone at once (see *Player suggestions* below). If the player's latest
  bridge is still on screen it is re-checked for free, which can complete it.

**Daily** is one shared puzzle per UTC date. **Practice** is unlimited, picks from the whole collection while
avoiding recent puzzles and today's daily, and never affects daily statistics.

## Code layout

```
src/data/links.ts     curated dictionary: links, link notes, spelling aliases, NEVER_LINKS
src/data/community-links.ts  phrases added from verified player suggestions (generated nightly)
src/data/puzzles.ts   puzzle collection and the tutorial example
src/lib/community.ts  client for the phrase service (load added phrases, send suggestions)
worker/               phrase service: Cloudflare Worker + D1 schema; worker/src/verify.ts judges Wiktionary entries
src/lib/graph.ts      builds the directed word graph; normalisation; link lookup
src/lib/paths.ts      bounded path search (used by hints, reveals and the content audit)
src/lib/game.ts       game rules: edit, check, duplicate detection, hints, reveal
src/lib/schedule.ts   UTC day numbers and the frozen daily schedule
src/lib/stats.ts      daily statistics and streaks, derived from saved games
src/lib/storage.ts    versioned, validated localStorage save
src/lib/share.ts      spoiler-free share text
src/lib/practice.ts   practice puzzle selection
src/lib/audit.ts      content validation (shared by tests and the script)
src/ui/*              React components; src/styles.css for all styling
scripts/validate-content.ts, scripts/sync-community.ts
tests/*.test.ts
```

## The dictionary (word graph)

`src/data/links.ts` lists every accepted link as a string. Each one is a **directed edge** from its first word to its
second; words are nodes.

```ts
'sun+flower'   // closed compound: SUN → FLOWER makes "sunflower"
'flower pot'   // open phrase:     FLOWER → POT makes "flower pot"
'x-ray'        // hyphenated:      X → RAY makes "x-ray"
```

Direction matters: `'flower pot'` does **not** allow POT → FLOWER. Words are lowercase letters only.

`LINK_NOTES` adds a short explanation to links whose meaning may not be obvious (shown in the result panel), keyed by
the two words separated by a space: `'still life': 'a painting of objects such as fruit or flowers'`.

`ALIASES` maps an accepted spelling variant to the word used in the links: `centre: 'center'`. A variant is accepted
anywhere its target is. A variant must never itself be a word in the dictionary (the audit rejects that as ambiguous).

### Adding phrases

1. Add the link string to `LINKS` in the right alphabetical group.
2. Only add combinations most everyday English speakers recognise immediately. No proper nouns, brand names,
   offensive terms, trivia or disputed expressions. A merely grammatical pairing ("red door") is not enough.
3. Optionally add a note to `LINK_NOTES`.
4. Run `pnpm validate:content` and `pnpm test`.

New links can create new valid answers for existing puzzles. That is intended: players are never compared against
one answer.

### Adding aliases

Add `variant: 'word'` to `ALIASES`. The target must be a word in the dictionary, and the variant must not be.

### Adding puzzles

Add an entry to `PUZZLES` in `src/data/puzzles.ts`:

```ts
{ id: 'rain-shop', start: 'rain', end: 'shop', gaps: 3, solution: ['forest', 'fire', 'work'], difficulty: 'standard', note: 'optional editor note' }
```

- `id` is permanent. Never rename, reuse or delete an ID once it has shipped (saves and the schedule refer to it).
- `gaps` is 3 for `standard`, 2 for `easy`.
- `solution` is one canonical answer, used for reveals and as the tie-breaker for hints. Every link in it must exist,
  and no word may repeat across the endpoints and solution.
- `note` is for maintainers and never shown during play.

`pnpm validate:content` then reports duplicate IDs, duplicate puzzles (same endpoints and length, or same
solution), broken or wrong-length solutions, repeated words, ambiguous aliases, unknown words, and endpoints that
cannot be connected at the required length. It also prints which puzzles have the fewest and most valid bridges.

A new puzzle is immediately available in Practice. To put it in the Daily rotation, see below.

## Preserving the daily schedule

The daily puzzle for a date is decided only by `FIRST_DATE` and `DAILY_ERAS` in `src/lib/schedule.ts`, never by the
order of `PUZZLES`. Day *n* after the era's start plays `order[n % order.length]` (the order repeats when it runs
out).

To keep past and current assignments stable:

- Never change `FIRST_DATE`.
- Never reorder, remove or replace entries in an existing era's `order` (including `ORIGINAL_ORDER`).
- To schedule new puzzles, **append a new era** whose `start` is a future UTC day number, with its own order:

```ts
export const DAILY_ERAS = [
  { start: FIRST_DAY, order: ORIGINAL_ORDER },
  { start: utcDay(Date.parse('2027-03-01T00:00:00Z')), order: [...ORIGINAL_ORDER, 'new-puzzle-id', 'another-id'] },
]
```

Dates before the new era keep the original assignment; puzzle numbers keep counting from `FIRST_DATE`. A test checks
that adding an era leaves earlier days unchanged.

## Player suggestions

When a link is marked ✕, the player can suggest it. The phrase service in `worker/` (a Cloudflare Worker with a D1
database, free tier) then:

1. looks up the closed, open and hyphenated forms (`sunhat`, `sun hat`, `sun-hat`) in Wiktionary with one request;
2. accepts the pair if an **English** entry exists as a noun, verb, adjective, adverb, phrase or idiom (not a proper
   noun), unless any form is labelled vulgar, offensive, derogatory or a slur, or uses a blocked word, and unless every
   sense is archaic, obsolete, rare or a misspelling (`worker/src/verify.ts`);
3. stores accepted phrases and serves them at `GET /links`. Every player's game loads that list on start, so a phrase
   added by one player works for everyone right away.

Every night (00:20 UTC) the deploy workflow runs `pnpm sync:community`, which copies accepted phrases into
`src/data/community-links.ts`, runs the tests and content validation, commits the file and republishes. Synced phrases
then also work offline.

Limits and safeguards: Wiktionary lists established compounds, not every everyday pairing (PARK BENCH has no entry, so
it can't be added this way; add such phrases to `links.ts` by hand). Each address may suggest 20 phrases an hour and
at most 300 phrases are added per day. Dictionary verdicts are cached for a week. IP addresses are only stored as
salted hashes and suggestion records are deleted after 30 days. Finished games are never re-scored by later additions.

**Removing an unwanted community phrase:** add it to `NEVER_LINKS` in `src/data/links.ts` (the game ignores it at once
after the next deploy), delete its line from `community-links.ts`, and optionally delete it from the database:

```powershell
npx wrangler@4 d1 execute word-bridge --remote --command "DELETE FROM links WHERE from_word='jelly' AND to_word='roll'"
```

### Setting up the phrase service

From the `worker/` folder, signed in with `npx wrangler@4 login`:

1. `npx wrangler@4 d1 create word-bridge`, then put the printed `database_id` in `wrangler.jsonc`.
2. `npx wrangler@4 d1 execute word-bridge --remote --file=schema.sql`
3. `npx wrangler@4 deploy` and note the `https://word-bridge-phrases.<subdomain>.workers.dev` address.
4. Put that address in `.env.production` as `VITE_COMMUNITY_API` (see `.env.example`), commit and push.

If `ALLOWED_ORIGINS` in `wrangler.jsonc` doesn't include the site's address, suggestions are refused. Without
`VITE_COMMUNITY_API` the game works as before and the Suggest dialog only offers a copyable suggestion. No secrets are
involved: the Worker address is public.

## Challenge mode: Single and Double

A run is **10 prompt words, 15 seconds each**. A bar under the score shrinks as time runs out (teal, then amber, then
red); when it's empty the next word appears automatically. Links count whether they're written joined (SUNFLOWER),
spaced (FOREST FIRE) or hyphenated. **Answers must be standalone English words**: never a single letter or a fragment
(CARE + N or CARE + FUL don't count), including answers found by live lookups.

- **Single:** type one word that comes **after** the prompt. FOREST → FIRE (forest fire).
- **Double:** type two words, one **before** and one **after** the prompt. RAIN + FOREST + FIRE (rainforest, forest fire).

Prompt words have **more than 25 connections** (Single: more than 25 words that can follow; Double: more than 25
before and more than 25 after), and are plain base words (no verb forms like GAVE or MAKES). The word after the prompt
becomes the next prompt when it's a prompt word itself; otherwise a fresh one is drawn. Each word can be used once
per run; **Skip** moves straight to the next word.

**Scoring (inspired by [Krillion](https://krillion.io/)):** each word scores 10 (obvious) to 100 (nearly
impossible). It starts from how common the phrase is in written English (the *base* score in the dictionary) and
moves toward how rarely other players give the same answer to the same prompt: once many players have answered a
prompt, an answer that a quarter or more of them gave scores 10 and one nobody else gave scores close to 100
(`points()` in `worker/src/challenge-engine.ts`).

The server runs every challenge: it keeps the clock, the prompt, the used words and the score, checks each answer
and scores it. An answer is accepted if it's in the challenge dictionary; otherwise the server looks it up live in
Wiktionary and then in Urban Dictionary (only popular entries whose definition isn't crude), caching the result.
Base scores from text counts run 10–80 (the top of the scale is earned when other players don’t give the same answer); live Wiktionary finds start at 85 and Urban Dictionary slang at 95.

### Challenge dictionary

`worker/data/challenge-words.txt` is generated by `scripts/build-challenge-dictionary.ts` from:

- Wiktionary's *English compound terms* (joined words such as *sunflower*, split into their two words) and the
  two-word entries in *English multiword terms* (*forest fire*), plus joined English lemmas that split into two
  common words;
- Peter Norvig's `count_1w.txt` / `count_2w.txt` word counts (Google web text) for the base rarity;
- the curated and community links of the main game.

It also writes `worker/data/english-words.txt`, the **standalone-word list** every answer is checked against: words
that are common in English web text and have a Wiktionary entry, minus known prefixes and suffixes (ful, ness, ment,
ing, un, re…); two-letter words only from a short list, and never single letters. Dictionary pairs with a part
that isn't standalone are dropped.

Entries in Wiktionary's vulgar, offensive, derogatory, ethnic-slur and swear-word categories, and pairs using
blocked words, are left out. To rebuild: fetch the category lists (titles via the Wiktionary API), download the two
count files and `enwiktionary-latest-all-titles-in-ns0.gz` from dumps.wikimedia.org, run
`node scripts/build-challenge-dictionary.ts <lists-dir> count_1w.txt count_2w.txt titles.gz`, then deploy the Worker.
Upgrading an existing database: run `worker/migrations/0002-single-double.sql` and `0003-rounds.sql` once each.

## Global leaderboard

Players are anonymous: the browser keeps a random player ID and a display name (default "Bridge Builder XXXX",
changeable in Settings, with an option to hide from the leaderboard). The phrase service (`worker/src/scores.ts`)
also:

- **counts every finished Daily and Practice game once** (`POST /games`, keyed by player + game: `daily-<day>` or a
  random practice ID). Games that couldn't be sent are retried on the next visit; repeats are ignored.
- **runs challenges on the server** (`worker/src/challenge-api.ts`): start, answer, skip and finish, with the
  server's own clock and score, so made-up or repeated answers score nothing.
- serves `GET /leaderboard`: worldwide totals, best Single and Double scores today and all time, and most bridges.

Names are checked for length and offensive words. Rate limits: 120 game reports and 40 challenge runs per hour per
address. Answers ship with the page and anyone could script a fast run, so this is a casual leaderboard, not a
cheat-proof one. To remove a player: `npx wrangler@4 d1 execute word-bridge --remote --command "UPDATE players SET hidden = 1 WHERE name = '…'"`.

## The curated dictionary's limits

The game knows **651 built-in links between 414 words**, plus any community phrases, and ships **69 puzzles**
(38 standard, 31 easy). It is a hand-picked collection of familiar compounds and phrases, not a full English
dictionary, so a real expression can be missing. That is why the game says *"Not in this game's dictionary"* rather
than "not a word", and why unrecognised links can be suggested. Checking a bridge is always done in the browser
against the loaded dictionary; only suggestions contact the phrase service (and through it, Wiktionary). Plurals and
other inflections are not accepted unless listed.

Puzzles, links and solutions ship inside the JavaScript bundle, so anyone can read the answers with the browser's
developer tools. This is a casual game, not a cheat-resistant competition.

## Saved data, statistics and UTC rollover

- Everything is stored in `localStorage` under `wordbridge.save`, as a versioned JSON object (`version: 1`). On load
  every saved game is validated against its puzzle; anything inconsistent (wrong lengths, unknown words, attempts after
  a win, more than five checks, hints that don't match) is dropped instead of trusted.
- If the saved data can't be parsed, the game starts fresh, keeps a copy under `wordbridge.save.unreadable`, and says
  so. If storage is blocked or full, the game stays playable and shows a notice that progress won't be kept.
- Daily games are stored per UTC day. Entries, checked bridges, hints and completion survive a refresh. A finished
  daily game is read-only and can't be replaced, so its result is recorded once.
- Statistics are derived from those per-day records: played, wins, win %, current and best streak, and the
  distribution of checks used for wins. A streak counts wins on consecutive daily puzzles; a loss or a missed day
  breaks it, but an unfinished puzzle today does not end yesterday's streak. Practice never affects them.
- The day changes at 00:00 UTC for everyone; the header shows the time left. If the date rolls over while the page is
  open and you haven't touched the current puzzle, it switches to the new one. If you were working on (or had just
  finished) the old puzzle, you can keep going and a banner offers today's bridge; the old puzzle's result still
  counts for its own date. After a refresh, Daily always opens on today's puzzle.
- **Settings › Reset all data** (with confirmation) deletes progress and statistics but keeps the theme.
- Theme follows the device until you choose Light or Dark in Settings; the choice is remembered.

## Accessibility notes

Full keyboard play (Tab between gaps; Enter moves to the next empty gap, or checks when the bridge is full), labelled
inputs and links, a live region announcing check and hint results, native `<dialog>` modals with Escape and focus
return, feedback shown with icons and text as well as color, light and dark themes, and `prefers-reduced-motion`
support.
