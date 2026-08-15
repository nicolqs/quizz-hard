-- Migration: Spaceteam game mode
-- Safe to run on existing databases, and safe to run twice.

-- Spaceteam keeps its whole game state (panels, live instructions, hull, level,
-- and the queue of control actions players have posted) in one JSONB column.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS spaceteam JSONB NOT NULL DEFAULT '{}'::jsonb;
