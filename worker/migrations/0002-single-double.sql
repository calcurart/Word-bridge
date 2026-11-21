-- One-off upgrade for databases created before Single/Double challenge modes (run once):
--   npx wrangler@4 d1 execute word-bridge --remote --file=migrations/0002-single-double.sql
ALTER TABLE players ADD COLUMN best_single INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN best_double INTEGER NOT NULL DEFAULT 0;
