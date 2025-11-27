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

