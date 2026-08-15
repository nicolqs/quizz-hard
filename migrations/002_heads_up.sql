-- Migration: Heads Up! game mode
-- Safe to run on existing databases. Paste into Neon SQL Editor.

-- Heads Up keeps all of its state (deck, turn order, current card, per-player
-- results) in a single JSONB column so the rooms table does not grow a column
-- per game mode. Statuses are unchanged: a turn reuses 'question', the turn
-- summary reuses 'results', and the leaderboard reuses 'final'.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS heads_up JSONB NOT NULL DEFAULT '{}'::jsonb;
