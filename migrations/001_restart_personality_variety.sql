-- Migration: support restart-with-same-code, personality mode, and variety
-- Safe to run on existing databases. Paste into Neon SQL Editor.

-- 1. Allow 'generating' status so the loading screen can be broadcast to players.
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check
  CHECK (status IN ('lobby', 'generating', 'question', 'results', 'final'));

-- 2. Persist game configuration that was previously held only in client memory.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS generated_theme TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT 'gpt-4o-mini';

-- 3. Track previously asked questions across rounds and a round counter,
--    so a host can keep playing with the same code and never see repeats.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS asked_questions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS round INTEGER NOT NULL DEFAULT 0;
