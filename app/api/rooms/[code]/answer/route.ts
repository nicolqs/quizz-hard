import { neon } from '@neondatabase/serverless'
import { NextRequest, NextResponse } from 'next/server'

const sql = neon(process.env.DATABASE_URL!)

/**
 * One player's answer, merged into rooms.responses by the database.
 *
 * Answers used to ride along on the whole-room PUT: each phone built
 * `{...room.responses, [me]: mine}` from its own copy of the room and saved the
 * lot. Two people answering at once meant the second save was built from a
 * snapshot taken before the first, so it wrote the map back without the first
 * player's answer - and their correct answer scored nothing and never showed up
 * on anyone's screen.
 *
 * `responses || jsonb` is applied inside a single UPDATE, so concurrent answers
 * merge instead of racing. Same reasoning as the Spaceteam and Sea Battle
 * endpoints, which were moved off the whole-room save for this exact reason.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params
    const roomCode = code.toUpperCase()
    const { playerId, answerIndex, remaining, round } = await request.json()

    if (typeof playerId !== 'string' || !playerId) {
      return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
    }
    if (typeof answerIndex !== 'number' || answerIndex < 0) {
      return NextResponse.json({ error: 'Missing answerIndex' }, { status: 400 })
    }

    const entry = JSON.stringify({
      [playerId]: { answerIndex, remaining: Math.max(0, Number(remaining) || 0) },
    })

    // The round guard stops an answer sent as the timer expires from landing in
    // the next question's tally. A miss here is a no-op, not an error: the
    // player simply answered too late.
    const rows = await sql`
      UPDATE rooms
      SET responses = COALESCE(responses, '{}'::jsonb) || ${entry}::jsonb,
          updated_at = NOW()
      WHERE code = ${roomCode}
        AND status = 'question'
        AND round = ${Number(round) || 0}
      RETURNING responses
    `

    if (rows.length === 0) {
      return NextResponse.json({ accepted: false, reason: 'round_closed' })
    }

    return NextResponse.json({ accepted: true, responses: rows[0].responses })
  } catch (error) {
    console.error('Error recording answer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
