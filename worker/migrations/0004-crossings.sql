-- One-off upgrade for "How others crossed" (the winning route of each daily game). Run once:
--   npx wrangler@4 d1 execute word-bridge --remote --file=migrations/0004-crossings.sql
ALTER TABLE games ADD COLUMN bridge TEXT;
CREATE INDEX IF NOT EXISTS games_by_bridge ON games (game_id, bridge);
