-- Migration: move the default model to the GPT-5.6 suite
-- Safe to run on existing databases, and safe to run twice.
-- Paste into Neon SQL Editor.

-- Only affects rows inserted without an explicit model; the app always sends one.
ALTER TABLE rooms ALTER COLUMN ai_model SET DEFAULT 'gpt-5.6-luna';

-- Point existing rooms at a 5.6 equivalent so replaying an old room does not call
-- a model that is no longer offered. Anything mid-tier maps to Terra; everything
-- else lands on Luna, because an unrecognised id must never silently upgrade a
-- party game to the most expensive model on the account.
UPDATE rooms SET ai_model = 'gpt-5.6-terra'
  WHERE ai_model NOT LIKE 'gpt-5.6-%'
    AND (ai_model LIKE '%mini%' OR ai_model LIKE 'o4%' OR ai_model IN ('gpt-4.1', 'gpt-5.1', 'gpt-5.4'));

UPDATE rooms SET ai_model = 'gpt-5.6-luna'
  WHERE ai_model NOT LIKE 'gpt-5.6-%';
