import { neon } from '@neondatabase/serverless'
import type { NextRequest } from 'next/server'

const sql = neon(process.env.DATABASE_URL!)

/**
 * Fixed-window rate limiting for the two endpoints that spend money.
 *
 * /api/generate-questions and /api/generate-deck are unauthenticated POSTs that
 * call OpenAI on the project's key, and the repo is public, so the call shape is
 * there for anyone to copy. Nothing stopped a script from running them in a loop
 * on the owner's credits.
 *
 * The counter lives in Postgres rather than in module scope because Fluid
 * Compute reuses instances but does not guarantee one: a per-instance counter
 * resets whenever a request lands on a cold instance, which is exactly when a
 * flood is happening. One UPDATE per generate call is noise next to the multi
 * second OpenAI call it guards.
 */

// Generous next to real play (a host generates one deck per round) and tight
// next to a script. The global ceiling is a backstop against a flood spread
// over many addresses; it is set well above any plausible party.
const PER_IP_LIMIT = 30
const GLOBAL_LIMIT = 600
const WINDOW = '1 hour'

export type RateLimitResult = { ok: true } | { ok: false; scope: 'ip' | 'global' }

let ensured: Promise<void> | null = null

function ensureTable(): Promise<void> {
  // Migrations here are applied by hand in the Neon console, so the table
  // creates itself on first use rather than silently failing on a database
  // where 006 was never pasted in. Once per process, not once per request.
  ensured ??= sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.then(() => undefined)
  return ensured
}

/** The caller's address, as far as the platform will tell us. */
export function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return (forwarded?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown').trim()
}

/**
 * Count one call against a bucket and say whether it is still under the limit.
 *
 * The increment and the window reset happen in the same statement, so parallel
 * requests cannot both read a stale count and both decide they are the first.
 */
async function bump(bucket: string, limit: number): Promise<boolean> {
  const rows = await sql`
    INSERT INTO rate_limits (bucket, count, window_start)
    VALUES (${bucket}, 1, NOW())
    ON CONFLICT (bucket) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < NOW() - ${WINDOW}::interval THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < NOW() - ${WINDOW}::interval THEN NOW()
        ELSE rate_limits.window_start
      END
    RETURNING count
  `
  return (rows[0]?.count ?? 0) <= limit
}

export async function checkRateLimit(request: NextRequest): Promise<RateLimitResult> {
  try {
    await ensureTable()

    // Per-address first: a single abusive caller should trip its own bucket
    // without also pushing the global counter toward locking everyone out.
    if (!(await bump(`ip:${clientKey(request)}`, PER_IP_LIMIT))) {
      return { ok: false, scope: 'ip' }
    }
    if (!(await bump('global', GLOBAL_LIMIT))) {
      return { ok: false, scope: 'global' }
    }
    return { ok: true }
  } catch (error) {
    // A limiter that fails closed would take the game down with the database.
    // Losing rate limiting during an outage is the better of the two failures.
    console.error('[RateLimit] check failed, allowing request:', error)
    return { ok: true }
  }
}

export function rateLimitMessage(scope: 'ip' | 'global'): string {
  return scope === 'ip'
    ? 'Too many question generations from this connection. Try again in a little while.'
    : 'The game is generating more questions than usual right now. Try again in a few minutes.'
}
