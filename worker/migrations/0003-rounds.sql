-- One-off upgrade for Challenge rounds (10 prompts, 15 seconds each). Run once:
--   npx wrangler@4 d1 execute word-bridge --remote --file=migrations/0003-rounds.sql
ALTER TABLE runs ADD COLUMN round INTEGER NOT NULL DEFAULT 1;
