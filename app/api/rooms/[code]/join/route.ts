import { neon } from '@neondatabase/serverless'
import { NextRequest, NextResponse } from 'next/server'

const sql = neon(process.env.DATABASE_URL!)

/**
 * Add one player to rooms.players, appended by the database.
 *
 * Joining used to be a whole-room PUT carrying `[...room.players, me]`, built
 * from whatever the joining phone had last fetched. Two people tapping Join at
 * the same time both sent a list that knew nothing about the other, so the
 * second save dropped the first player - the host's lobby was simply missing
 * somebody who had definitely joined.
 *
 * The append happens inside one UPDATE against the current row, so simultaneous
 * joins queue up instead of overwriting each other.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params
    const roomCode = code.toUpperCase()
    const { id, name } = await request.json()

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Missing player id' }, { status: 400 })
    }

    const player = JSON.stringify([{ id, name: name || 'Mystery Player', score: 0 }])

    // Re-sending the same id is a no-op rather than a duplicate row, so a retry
    // after a flaky connection cannot put someone in the lobby twice.
    const rows = await sql`
      UPDATE rooms
      SET players = CASE
            WHEN players @> ${JSON.stringify([{ id }])}::jsonb THEN players
            ELSE COALESCE(players, '[]'::jsonb) || ${player}::jsonb
          END,
          updated_at = NOW()
      WHERE code = ${roomCode}
      RETURNING players
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    return NextResponse.json({ players: rows[0].players })
  } catch (error) {
    console.error('Error joining room:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
