-- Word Bridge phrase service database (Cloudflare D1 / SQLite).
-- Apply with: npx wrangler@4 d1 execute word-bridge --remote --file=schema.sql

-- Phrases added from verified suggestions. Served to every player by GET /links.
CREATE TABLE IF NOT EXISTS links (
  from_word TEXT NOT NULL,
  to_word TEXT NOT NULL,
  source TEXT NOT NULL,      -- link in the game's format: 'sun+hat', 'fire alarm', 'x-ray'
  title TEXT NOT NULL,       -- the Wiktionary page that confirmed it
  added_at INTEGER NOT NULL, -- milliseconds since 1970
  PRIMARY KEY (from_word, to_word)
);

-- Cached dictionary verdicts, so repeated suggestions don't query Wiktionary again.
CREATE TABLE IF NOT EXISTS lookups (
  pair TEXT PRIMARY KEY,     -- 'first second'
  verdict TEXT NOT NULL,     -- ok | not-found | offensive | unfamiliar
  source TEXT,
  checked_at INTEGER NOT NULL
);

-- Recent suggestions, used only for rate limiting. Rows older than 30 days are deleted.
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pair TEXT NOT NULL,
  ip_hash TEXT NOT NULL,     -- salted SHA-256, never the raw address
  verdict TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS suggestions_by_ip ON suggestions (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
