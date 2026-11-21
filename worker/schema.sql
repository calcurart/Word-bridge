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

-- Players are anonymous: a random ID from their browser and a display name they chose (or a default).
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,       -- 1 = counted in totals but not shown on the leaderboard
  games INTEGER NOT NULL DEFAULT 0,        -- finished daily + practice games
  wins INTEGER NOT NULL DEFAULT 0,
  best_challenge INTEGER NOT NULL DEFAULT 0,   -- old five-minute challenge (no longer shown)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_by_games ON players (games DESC);
CREATE INDEX IF NOT EXISTS players_by_challenge ON players (best_challenge DESC);

-- Every finished daily or practice game, counted once per player and game.
CREATE TABLE IF NOT EXISTS games (
  player_id TEXT NOT NULL,
  game_id TEXT NOT NULL,                   -- 'daily-20776' or 'practice-<random>'
  mode TEXT NOT NULL,
  won INTEGER NOT NULL,
  checks INTEGER NOT NULL,
  hints INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, game_id)
);
CREATE INDEX IF NOT EXISTS games_by_ip ON games (ip_hash, created_at);

-- Challenge runs. The server starts the clock, so a score is only accepted within five minutes (plus a short grace).
CREATE TABLE IF NOT EXISTS challenge_runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  score INTEGER,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_by_finish ON challenge_runs (finished_at);
CREATE INDEX IF NOT EXISTS runs_by_ip ON challenge_runs (ip_hash, started_at);

-- Challenge runs (Single and Double). The server keeps the clock, prompt, used words and score.
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  mode TEXT NOT NULL,                      -- 'single' or 'double'
  prompt TEXT NOT NULL,
  used TEXT NOT NULL,                      -- JSON array of words used this run
  score INTEGER NOT NULL DEFAULT 0,
  answers INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  finished_at INTEGER,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_by_mode_finish ON runs (mode, finished_at);
CREATE INDEX IF NOT EXISTS runs_by_ip_start ON runs (ip_hash, started_at);

-- How often players give each answer to each prompt; rarer answers score more (Krillion-style).
CREATE TABLE IF NOT EXISTS answer_counts (
  slot TEXT NOT NULL,                      -- 'after' (PROMPT ___) or 'before' (___ PROMPT)
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  picks INTEGER NOT NULL,
  PRIMARY KEY (slot, prompt, answer)
);
CREATE TABLE IF NOT EXISTS prompt_counts (
  slot TEXT NOT NULL,
  prompt TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (slot, prompt)
);
