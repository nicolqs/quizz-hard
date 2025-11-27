import { neon } from '@neondatabase/serverless'
import { NextRequest } from 'next/server'

const sql = neon(process.env.DATABASE_URL!)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Helper function to send room update
      const sendRoomUpdate = (room: any) => {
        const frontendRoom = {
          code: room.code,
          hostName: room.host_name,
          theme: room.theme,
          difficulty: room.difficulty,
          questionCount: room.question_count,
          timePerQuestion: room.time_per_question,
          players: room.players || [],
          questions: room.questions || [],
          currentIndex: room.current_index || 0,
          status: room.status,
          responses: room.responses || {},
          lastGain: room.last_gain || {},
        }
        
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'update', room: frontendRoom })}\n\n`)
        )
      }
      
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))

      // Send initial room state immediately
      try {
        const initialResult = await sql`
          SELECT * FROM rooms WHERE code = ${roomCode}
        `
        if (initialResult.length > 0) {
          sendRoomUpdate(initialResult[0])
        }
      } catch (error) {
        console.error('SSE initial fetch error:', error)
      }

      // Poll database and send updates
      let lastUpdatedAt: string | null = null
      
      const interval = setInterval(async () => {
        try {
          const result = await sql`
            SELECT * FROM rooms WHERE code = ${roomCode}
          `
          
          if (result.length > 0) {
            const room = result[0]
            
            // Only send if room was updated
            if (room.updated_at !== lastUpdatedAt) {
              lastUpdatedAt = room.updated_at
              sendRoomUpdate(room)
            }
          }
        } catch (error) {
          console.error('SSE error:', error)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Database error' })}\n\n`)
          )
        }
      }, 300) // Check every 300ms for near real-time

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

