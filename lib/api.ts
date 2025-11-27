// API client for Next.js with Neon database

export async function getRoom(code: string): Promise<any | null> {
  try {
    const response = await fetch(`/api/rooms/${code}`)
    if (response.status === 404) return null
    
    // Check if response is JSON
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('API not available (not returning JSON)')
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || 'Failed to fetch room')
    }
    return await response.json()
  } catch (error) {
    console.warn('[API] getRoom failed:', error instanceof Error ? error.message : 'Unknown error')
    return null
  }
}

export async function saveRoom(room: any): Promise<void> {
  try {
    const response = await fetch(`/api/rooms/${room.code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room),
    })
    
    // Check if response is JSON
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('API not available (not returning JSON)')
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || 'Failed to save room')
    }
  } catch (error) {
    console.warn('[API] saveRoom failed:', error instanceof Error ? error.message : 'Unknown error')
    throw error
  }
}

// Real-time subscription with automatic fallback
// Uses SSE if available, otherwise falls back to polling
export function subscribeToRoom(
  code: string,
  onUpdate: (room: any) => void,
  onError?: (error: Error) => void
): () => void {
  let eventSource: EventSource | null = null
  let pollInterval: number | null = null
  let isActive = true
  let lastRoomState: string | null = null

  // Try SSE first
  const trySSE = () => {
    if (!isActive) return

    try {
      console.log('[SSE] Attempting to connect to SSE stream...')
      eventSource = new EventSource(`/api/rooms-stream/${code}`)
      let hasReceivedData = false

      eventSource.onmessage = (event) => {
        hasReceivedData = true
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'update' && data.room) {
            const newState = JSON.stringify(data.room)
            if (newState !== lastRoomState) {
              lastRoomState = newState
              onUpdate(data.room)
            }
          }
        } catch (err) {
          console.error('[SSE] Error parsing message:', err)
        }
      }

      eventSource.onerror = (err) => {
        console.error('[SSE] Connection error, falling back to polling')
        eventSource?.close()
        eventSource = null
        if (isActive && !hasReceivedData) {
          // SSE failed, fallback to polling
          startPolling()
        }
      }

      // Timeout for SSE - if no data after 3 seconds, fallback to polling
      setTimeout(() => {
        if (!hasReceivedData && isActive) {
          console.log('[SSE] No data received, falling back to polling')
          eventSource?.close()
          eventSource = null
          startPolling()
        }
      }, 3000)
    } catch (err) {
      console.error('[SSE] Failed to initialize, falling back to polling')
      startPolling()
    }
  }

  // Polling fallback
  const startPolling = () => {
    if (!isActive || pollInterval) return

    console.log('[Polling] Starting polling mode (500ms interval)')
    
    const poll = async () => {
      if (!isActive) return
      
      try {
        const room = await getRoom(code)
        if (room) {
          const newState = JSON.stringify(room)
          if (newState !== lastRoomState) {
            lastRoomState = newState
            onUpdate(room)
          }
        }
      } catch (err) {
        console.error('[Polling] Error:', err)
      }
    }

    // Initial poll
    poll()
    
    // Set up interval
    pollInterval = setInterval(poll, 500) as unknown as number
  }

  // Start with SSE attempt
  trySSE()

  // Cleanup function
  return () => {
    isActive = false
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }
}

