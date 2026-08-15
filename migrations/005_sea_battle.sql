-- Migration: Sea Battle game mode
-- Safe to run on existing databases, and safe to run twice.

-- Public state: whose turn it is, every shot fired and what it hit.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS sea_battle JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Private state: where the ships actually are. This column is deliberately NOT
-- returned by the room routes or the SSE stream, so a player cannot read their
-- opponent's fleet out of a network response. Shots are resolved server-side
-- against it and only the result travels back.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS sea_battle_boards JSONB NOT NULL DEFAULT '{}'::jsonb;
