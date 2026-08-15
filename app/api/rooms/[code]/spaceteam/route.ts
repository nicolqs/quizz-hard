import { neon } from '@neondatabase/serverless'
import { NextRequest, NextResponse } from 'next/server'

const sql = neon(process.env.DATABASE_URL!)

/**
 * Spaceteam writes do not go through the whole-room PUT.
 *
 * Several players hammer their controls at once while the host rewrites the game
 * state on a timer. A read-modify-write of the whole room would drop presses on
 * the floor, so both operations here are single atomic statements against the
 * JSONB column:
 *
 *   op=action  appends one control press to spaceteam.pending
 *   op=state   writes the host's computed state while KEEPING any press that
 *              arrived after the host read, by only dropping entries it has
 *              already processed (seq <= through)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params
    const roomCode = code.toUpperCase()
    const body = await request.json()

    if (body.op === 'action') {
      const { playerId, controlId, value, seq } = body
      if (!playerId || !controlId || typeof value !== 'number' || typeof seq !== 'number') {
        return NextResponse.json({ error: 'playerId, controlId, value and seq are required' }, { status: 400 })
      }

      const action = JSON.stringify([{ seq, playerId, controlId, value }])
      await sql`
        UPDATE rooms
        SET spaceteam = jsonb_set(
              spaceteam,
              '{pending}',
              COALESCE(spaceteam->'pending', '[]'::jsonb) || ${action}::jsonb,
              true
            ),
            updated_at = NOW()
        WHERE code = ${roomCode}
      `
      return NextResponse.json({ success: true })
    }

    if (body.op === 'state') {
      const { state, through } = body
      if (!state) return NextResponse.json({ error: 'state is required' }, { status: 400 })

      const nextState = JSON.stringify({ ...state, pending: [] })
      const drainThrough = Number(through) || 0

      await sql`
        UPDATE rooms
        SET spaceteam = ${nextState}::jsonb || jsonb_build_object(
              'pending',
              COALESCE(
                (
                  SELECT jsonb_agg(entry)
                  FROM jsonb_array_elements(COALESCE(spaceteam->'pending', '[]'::jsonb)) AS entry
                  WHERE (entry->>'seq')::bigint > ${drainThrough}
                ),
                '[]'::jsonb
              )
            ),
            updated_at = NOW()
        WHERE code = ${roomCode}
      `
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: `Unknown op: ${body.op}` }, { status: 400 })
  } catch (error) {
    console.error('Error updating spaceteam state:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
