import { neon } from '@neondatabase/serverless'
import { NextRequest, NextResponse } from 'next/server'

const sql = neon(process.env.DATABASE_URL!)

function rowToRoom(room: any) {
  return {
    code: room.code,
    hostName: room.host_name,
    gameMode: room.game_mode || 'standard',
    theme: room.theme,
    generatedTheme: room.generated_theme || undefined,
    aiModel: room.ai_model || 'gpt-4o-mini',
    difficulty: room.difficulty,
    questionCount: room.question_count,
    timePerQuestion: room.time_per_question,
    players: room.players || [],
    questions: room.questions || [],
    askedQuestions: room.asked_questions || [],
    round: room.round ?? 0,
    currentIndex: room.current_index || 0,
    status: room.status,
    responses: room.responses || {},
    lastGain: room.last_gain || {},
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const roomCode = code.toUpperCase()

    const result = await sql`
      SELECT * FROM rooms WHERE code = ${roomCode}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    return NextResponse.json(rowToRoom(result[0]))
  } catch (error) {
    console.error('Error fetching room:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const roomCode = code.toUpperCase()
    const room = await request.json()

    await sql`
      INSERT INTO rooms (
        code, host_name, game_mode, theme, generated_theme, ai_model,
        difficulty, question_count, time_per_question,
        players, questions, asked_questions, round,
        current_index, status, responses, last_gain
      ) VALUES (
        ${roomCode},
        ${room.hostName},
        ${room.gameMode || 'standard'},
        ${room.theme},
        ${room.generatedTheme || null},
        ${room.aiModel || 'gpt-4o-mini'},
        ${room.difficulty},
        ${room.questionCount},
        ${room.timePerQuestion},
        ${JSON.stringify(room.players)},
        ${JSON.stringify(room.questions)},
        ${JSON.stringify(room.askedQuestions || [])},
        ${room.round ?? 0},
        ${room.currentIndex || 0},
        ${room.status},
        ${JSON.stringify(room.responses || {})},
        ${JSON.stringify(room.lastGain || {})}
      )
      ON CONFLICT (code) DO UPDATE SET
        host_name = EXCLUDED.host_name,
        game_mode = EXCLUDED.game_mode,
        theme = EXCLUDED.theme,
        generated_theme = EXCLUDED.generated_theme,
        ai_model = EXCLUDED.ai_model,
        difficulty = EXCLUDED.difficulty,
        question_count = EXCLUDED.question_count,
        time_per_question = EXCLUDED.time_per_question,
        players = EXCLUDED.players,
        questions = EXCLUDED.questions,
        asked_questions = EXCLUDED.asked_questions,
        round = EXCLUDED.round,
        current_index = EXCLUDED.current_index,
        status = EXCLUDED.status,
        responses = EXCLUDED.responses,
        last_gain = EXCLUDED.last_gain,
        updated_at = NOW()
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating room:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
