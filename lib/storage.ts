import type { Room } from './types'

const ROOM_STORAGE_KEY = 'nix-games-rooms'

export async function getRoomFromStorage(code: string): Promise<Room | null> {
  // Try API first
  try {
    const response = await fetch(`/api/rooms/${code}`)
    if (response.ok) {
      const room = await response.json()
      console.log('[💾 Storage] Fetched room from API:', code)
      return room as Room
    }
  } catch (err) {
    console.warn('[💾 Storage] API not available, using localStorage')
  }
  
  // Fallback to localStorage
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(ROOM_STORAGE_KEY)
    if (!stored) return null
    const rooms: Record<string, Room> = JSON.parse(stored)
    const room = rooms[code] || null
    if (room) {
      console.log('[💾 Storage] Fetched room from localStorage:', code, '| Players:', room.players.length)
    }
    return room
  } catch {
    return null
  }
}

export async function saveRoomToStorage(room: Room): Promise<void> {
  console.log('[💾 Storage] Saving room:', room.code, '| Players:', room.players.length, room.players.map(p => p.name))
  
  // Try API first
  try {
    const response = await fetch(`/api/rooms/${room.code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room),
    })
    if (response.ok) {
      console.log('[💾 Storage] Saved to API successfully')
    }
  } catch (err) {
    console.warn('[💾 Storage] API not available, using localStorage only')
  }
  
  // Always save to localStorage as backup
  if (typeof window === 'undefined') return
  
  try {
    const stored = localStorage.getItem(ROOM_STORAGE_KEY)
    const rooms: Record<string, Room> = stored ? JSON.parse(stored) : {}
    rooms[room.code] = room
    localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(rooms))
    console.log('[💾 Storage] Saved to localStorage successfully')
  } catch (err) {
    console.error('[💾 Storage] Failed to save to localStorage:', err)
  }
}



/**
 * Record one answer without sending the whole room.
 *
 * The server merges it into rooms.responses, so two players answering at the
 * same moment cannot overwrite each other. Returns the merged map, which is
 * ahead of whatever this phone last synced.
 */
export async function saveAnswer(
  code: string,
  playerId: string,
  answerIndex: number,
  remaining: number,
  round: number,
): Promise<Record<string, { answerIndex: number; remaining: number }> | null> {
  try {
    const response = await fetch(`/api/rooms/${code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, answerIndex, remaining, round }),
    })
    if (!response.ok) return null
    const body = await response.json()
    return body.accepted ? body.responses : null
  } catch (err) {
    console.error('[💾 Storage] Failed to record answer:', err)
    return null
  }
}

/**
 * Add this player to the lobby. The server appends, so simultaneous joins do
 * not drop each other. Returns the full player list.
 */
export async function joinRoomOnServer(
  code: string,
  player: { id: string; name: string },
): Promise<Array<{ id: string; name: string; score: number }> | null> {
  try {
    const response = await fetch(`/api/rooms/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(player),
    })
    if (!response.ok) return null
    const body = await response.json()
    return body.players ?? null
  } catch (err) {
    console.error('[💾 Storage] Failed to join room:', err)
    return null
  }
}
