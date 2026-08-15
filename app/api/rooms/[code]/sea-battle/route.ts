import { neon } from '@neondatabase/serverless'
import { NextRequest, NextResponse } from 'next/server'
import {
  allSunk,
  canPlace,
  combatants,
  emptyState,
  isComplete,
  nextTurn,
  resolveShot,
  type Board,
  type SeaBattleState,
} from '@/lib/seabattle'

const sql = neon(process.env.DATABASE_URL!)

/**
 * Sea Battle moves are resolved here rather than in the browser.
 *
 * Ship layouts live in rooms.sea_battle_boards, which no room route and no SSE
 * frame ever returns. A player can only ever fetch their own fleet, and a shot
 * comes back as hit/miss/sunk. Reading the opponent's board out of a network
 * response is therefore not possible, which is the whole game.
 */

type Row = { sea_battle: SeaBattleState | null; sea_battle_boards: Record<string, Board> | null }

async function load(code: string): Promise<Row | null> {
  const rows = (await sql`
    SELECT sea_battle, sea_battle_boards FROM rooms WHERE code = ${code}
  `) as Row[]
  return rows[0] ?? null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params
    const playerId = request.nextUrl.searchParams.get('playerId') || ''
    const row = await load(code.toUpperCase())
    if (!row) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    const state = row.sea_battle ?? null
    const boards = row.sea_battle_boards ?? {}

    // Your own fleet always. Everyone's fleet once the game is over, so the
    // loser gets to see where the ships actually were.
    const visible = state?.winner ? boards : { [playerId]: boards[playerId] }

    return NextResponse.json({ state, boards: visible })
  } catch (error) {
    console.error('Error reading sea battle:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params
    const roomCode = code.toUpperCase()
    const body = await request.json()
    const row = await load(roomCode)
    if (!row) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    // ------------------------------------------------------------- new game
    if (body.op === 'start') {
      const playerIds = combatants(body.playerIds ?? [])
      if (playerIds.length < 2) {
        return NextResponse.json({ error: 'Sea Battle needs two players' }, { status: 400 })
      }
      const state = emptyState(playerIds, Date.now())
      await sql`
        UPDATE rooms
        SET sea_battle = ${JSON.stringify(state)}::jsonb,
            sea_battle_boards = '{}'::jsonb,
            updated_at = NOW()
        WHERE code = ${roomCode}
      `
      return NextResponse.json({ state })
    }

    const state = row.sea_battle
    if (!state?.playerIds?.length) {
      return NextResponse.json({ error: 'No game in progress' }, { status: 409 })
    }

    // --------------------------------------------------------- place a fleet
    if (body.op === 'board') {
      const { playerId, board } = body as { playerId: string; board: Board }
      if (!state.playerIds.includes(playerId)) {
        return NextResponse.json({ error: 'You are watching, not playing' }, { status: 403 })
      }
      if (state.turn) {
        return NextResponse.json({ error: 'The battle has already started' }, { status: 409 })
      }
      // Trust nothing from the client: re-validate the whole fleet here.
      const rebuilt: Board = { placements: [] }
      for (const placement of board?.placements ?? []) {
        if (!canPlace(rebuilt, placement)) {
          return NextResponse.json({ error: 'Illegal fleet layout' }, { status: 400 })
        }
        rebuilt.placements.push(placement)
      }
      if (!isComplete(rebuilt)) {
        return NextResponse.json({ error: 'Place every ship first' }, { status: 400 })
      }

      // Two players place at the same time, so each writes only its own key.
      await sql`
        UPDATE rooms
        SET sea_battle_boards = jsonb_set(sea_battle_boards, ${`{${playerId}}`}, ${JSON.stringify(rebuilt)}::jsonb, true),
            sea_battle = jsonb_set(sea_battle, ${`{ready,${playerId}}`}, 'true'::jsonb, true),
            updated_at = NOW()
        WHERE code = ${roomCode}
      `

      // Once both fleets are down, the first player opens fire.
      const after = await load(roomCode)
      const ready = after?.sea_battle?.ready ?? {}
      if (!after?.sea_battle?.turn && state.playerIds.every((id) => ready[id])) {
        await sql`
          UPDATE rooms
          SET sea_battle = jsonb_set(sea_battle, '{turn}', ${JSON.stringify(state.playerIds[0])}::jsonb, true)
          WHERE code = ${roomCode} AND sea_battle->>'turn' IS NULL
        `
      }

      const fresh = await load(roomCode)
      return NextResponse.json({ state: fresh?.sea_battle })
    }

    // ------------------------------------------------------------------ fire
    if (body.op === 'fire') {
      const { playerId, x, y } = body as { playerId: string; x: number; y: number }
      if (state.winner) return NextResponse.json({ error: 'The battle is over' }, { status: 409 })
      if (state.turn !== playerId) {
        return NextResponse.json({ error: 'Not your turn' }, { status: 409 })
      }

      const opponentId = state.playerIds.find((id) => id !== playerId)
      const target = opponentId ? row.sea_battle_boards?.[opponentId] : null
      if (!opponentId || !target) {
        return NextResponse.json({ error: 'Opponent has no fleet' }, { status: 409 })
      }

      const alreadyFired = state.shots.filter((shot) => shot.by === playerId)
      const shot = resolveShot(target, alreadyFired, playerId, x, y, Date.now())
      if (!shot) return NextResponse.json({ error: 'Illegal shot' }, { status: 400 })

      const shots = [...state.shots, shot]
      const finished = allSunk(target, shots.filter((s) => s.by === playerId))
      const updated: SeaBattleState = {
        ...state,
        shots,
        turn: finished ? null : nextTurn(playerId, opponentId, shot.result),
        winner: finished ? playerId : null,
      }

      await sql`
        UPDATE rooms
        SET sea_battle = ${JSON.stringify(updated)}::jsonb, updated_at = NOW()
        WHERE code = ${roomCode}
      `
      return NextResponse.json({ state: updated, shot })
    }

    return NextResponse.json({ error: `Unknown op: ${body.op}` }, { status: 400 })
  } catch (error) {
    console.error('Error in sea battle move:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
