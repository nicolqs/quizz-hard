-- Migration: rate limiting for the two endpoints that spend OpenAI credits
-- Safe to run on existing databases, and safe to run twice.
-- Paste into Neon SQL Editor.

-- /api/generate-questions and /api/generate-deck are unauthenticated POSTs that
-- call OpenAI on the project's key, and this repo is public, so the request
-- shape is there for anyone to copy. This table holds a fixed-window counter
-- per caller address, plus one global backstop row.
--
-- lib/ratelimit.ts also creates this table on first use, so an environment
-- where this file was never pasted in still ends up limited. The migration is
-- here so a fresh database gets it up front rather than on the first flood.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
