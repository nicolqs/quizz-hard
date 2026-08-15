// Sea Battle: two hidden fleets, alternating shots, hit gives you another go.
//
// The rules live here as pure functions. Ship layouts never reach the opponent's
// browser: they sit in a private column that the room routes do not return, and
// shots are resolved on the server, so "open devtools and read the answer" is
// not a move.

export const BOARD_SIZE = 8

/** Classic-ish fleet, scaled for an 8x8 board on a phone. */
export const FLEET = [
  { id: 'carrier', name: 'Carrier', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
  { id: 'patrol', name: 'Patrol Boat', length: 2 },
] as const

export type ShipId = (typeof FLEET)[number]['id']

export type Placement = {
  shipId: ShipId
  x: number
  y: number
  horizontal: boolean
}

/** A fleet as placed. Kept server-side only. */
export type Board = { placements: Placement[] }

export type ShotResult = 'miss' | 'hit' | 'sunk'

export type Shot = {
  by: string
  x: number
  y: number
  result: ShotResult
  /** Set when the shot sank something, so the log can name it. */
  shipId?: ShipId
  at: number
}

/** Everything both players are allowed to see. */
export type SeaBattleState = {
  playerIds: string[]
  ready: Record<string, boolean>
  shots: Shot[]
  turn: string | null
  winner: string | null
  startedAt: number
}

export const shipById = (id: ShipId) => FLEET.find((s) => s.id === id)!

export const key = (x: number, y: number) => `${x},${y}`

/** Every cell a placement covers. */
export function cellsOf(placement: Placement): { x: number; y: number }[] {
  const { length } = shipById(placement.shipId)
  return Array.from({ length }, (_, i) => ({
    x: placement.x + (placement.horizontal ? i : 0),
    y: placement.y + (placement.horizontal ? 0 : i),
  }))
}

export function occupied(board: Board): Map<string, ShipId> {
  const map = new Map<string, ShipId>()
  for (const placement of board.placements) {
    for (const cell of cellsOf(placement)) map.set(key(cell.x, cell.y), placement.shipId)
  }
  return map
}

/** On the board, not overlapping, and not touching another ship even diagonally. */
export function canPlace(board: Board, placement: Placement): boolean {
  const cells = cellsOf(placement)
  if (cells.some((c) => c.x < 0 || c.y < 0 || c.x >= BOARD_SIZE || c.y >= BOARD_SIZE)) return false

  const taken = occupied({ placements: board.placements.filter((p) => p.shipId !== placement.shipId) })
  for (const cell of cells) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (taken.has(key(cell.x + dx, cell.y + dy))) return false
      }
    }
  }
  return true
}

export function isComplete(board: Board): boolean {
  return (
    board.placements.length === FLEET.length &&
    FLEET.every((ship) => board.placements.some((p) => p.shipId === ship.id))
  )
}

/** A legal random fleet, for the "scatter" button nobody admits to using. */
export function randomBoard(random: () => number = Math.random): Board {
  const board: Board = { placements: [] }
  for (const ship of FLEET) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const placement: Placement = {
        shipId: ship.id,
        x: Math.floor(random() * BOARD_SIZE),
        y: Math.floor(random() * BOARD_SIZE),
        horizontal: random() < 0.5,
      }
      if (canPlace(board, placement)) {
        board.placements.push(placement)
        break
      }
    }
  }
  return board
}

/** Which ships of this board are already destroyed, given the shots fired at it. */
export function sunkShips(board: Board, shotsAtBoard: Shot[]): Set<ShipId> {
  const hits = new Set(shotsAtBoard.map((s) => key(s.x, s.y)))
  const sunk = new Set<ShipId>()
  for (const placement of board.placements) {
    if (cellsOf(placement).every((cell) => hits.has(key(cell.x, cell.y)))) sunk.add(placement.shipId)
  }
  return sunk
}

export function allSunk(board: Board, shotsAtBoard: Shot[]): boolean {
  // Counted against this board's own ships rather than the global fleet size,
  // so a board that somehow holds a different number of ships is still winnable
  // instead of silently becoming an unwinnable game.
  return board.placements.length > 0 && sunkShips(board, shotsAtBoard).size === board.placements.length
}

/**
 * Resolves one shot against a board. Returns null when the shot is not legal,
 * which the caller should treat as "ignore", not as a turn.
 */
export function resolveShot(
  board: Board,
  previousShots: Shot[],
  by: string,
  x: number,
  y: number,
  now: number,
): Shot | null {
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return null
  if (previousShots.some((s) => s.x === x && s.y === y)) return null // already fired there

  const shipId = occupied(board).get(key(x, y))
  if (!shipId) return { by, x, y, result: 'miss', at: now }

  const withThis = [...previousShots, { by, x, y, result: 'hit' as const, at: now }]
  const isSunk = sunkShips(board, withThis).has(shipId)
  return { by, x, y, result: isSunk ? 'sunk' : 'hit', shipId, at: now }
}

/** A hit buys you another shot, so the turn only passes on a miss. */
export function nextTurn(current: string, opponent: string, result: ShotResult): string {
  return result === 'miss' ? opponent : current
}

export function emptyState(playerIds: string[], now: number): SeaBattleState {
  return {
    playerIds,
    ready: {},
    shots: [],
    turn: null,
    winner: null,
    startedAt: now,
  }
}

/** The two combatants: the first two players in the room. Everyone else watches. */
export const combatants = (playerIds: string[]) => playerIds.slice(0, 2)

export const opponentOf = (state: SeaBattleState, playerId: string) =>
  state.playerIds.find((id) => id !== playerId) ?? null

export const shotsAgainst = (state: SeaBattleState, playerId: string) =>
  state.shots.filter((shot) => shot.by !== playerId)

export const shotsBy = (state: SeaBattleState, playerId: string) =>
  state.shots.filter((shot) => shot.by === playerId)
