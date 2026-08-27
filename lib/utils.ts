export function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase()
}

/**
 * A player id that two phones cannot land on at once.
 *
 * This was `${prefix}-${Date.now()}`, which is only unique if no two people
 * tap Join in the same millisecond - and the whole point of the lobby is that
 * everybody joins at the same time. Two players sharing an id share everything
 * keyed by it: one slot in room.responses, so the second answer overwrote the
 * first and one player scored nothing all game; one entry matched by
 * players.find, so the wrong name took the points. Once the join route started
 * treating a repeated id as a no-op, a collision instead dropped the second
 * player out of the lobby entirely.
 *
 * The timestamp stays because it keeps ids roughly sortable and readable in
 * logs; the random suffix is what actually makes them unique.
 */
export function generatePlayerId(prefix: string = 'player'): string {
  const unique =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now()}-${unique}`
}
