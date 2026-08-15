-- Migration: move the default model to the GPT-5.6 suite
-- Safe to run on existing databases, and safe to run twice.
-- Paste into Neon SQL Editor.

-- Only affects rows inserted without an explicit model; the app always sends one.
ALTER TABLE rooms ALTER COLUMN ai_model SET DEFAULT 'gpt-5.6-luna';

-- Point existing rooms at a 5.6 equivalent so replaying an old room does not call
-- a model that is no longer offered.
--
-- Only the deliberate flagship choices move to Terra. Everything else, including
-- every budget model and any id this migration does not recognise, lands on Luna:
-- a migration must never quietly make an old party game more expensive to replay,
-- and Sol is a choice you make in the UI, not something you inherit.
UPDATE rooms SET ai_model = 'gpt-5.6-terra'
  WHERE ai_model IN ('gpt-4.1', 'gpt-5.1', 'gpt-5.4', 'gpt-5', 'gpt-4o', 'gpt-5-mini', 'gpt-5.1-mini', 'o4-mini');

UPDATE rooms SET ai_model = 'gpt-5.6-luna'
  WHERE ai_model NOT LIKE 'gpt-5.6-%';
