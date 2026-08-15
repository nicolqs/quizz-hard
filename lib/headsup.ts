import type { HeadsUpCardResult, HeadsUpState, Player, Room } from './types'

// Pure helpers for the Heads Up turn cycle. Both the host screen and the player
// screen drive the same room object, so the transitions live here rather than
// being written twice with subtly different rules.

/** Seconds of "phone on your forehead" before the timer actually starts. */
export const LEAD_IN_SECONDS = 3

export function headsUpState(room: Room | null): HeadsUpState | null {
  if (!room || room.gameMode !== 'headsup') return null
  return room.headsUp ?? null
}

export function currentGuesserId(room: Room | null): string | null {
  const state = headsUpState(room)
  if (!state) return null
  return state.order[state.turnIndex] ?? null
}

export function guesserName(room: Room | null): string {
  const id = currentGuesserId(room)
  return room?.players.find((p) => p.id === id)?.name ?? 'Someone'
}

export function isLastTurn(room: Room | null): boolean {
  const state = headsUpState(room)
  if (!state) return false
  return state.turnIndex >= state.order.length - 1
}

/**
 * Where the turn is right now, derived from the shared start time so every
 * device agrees. Before turnStartedAt we are in the 3-2-1 lead-in.
 */
export function turnClock(
  state: HeadsUpState | null,
  now: number = Date.now(),
): { countdown: number; timeLeft: number; expired: boolean } {
  if (!state?.turnStartedAt) {
    return { countdown: LEAD_IN_SECONDS, timeLeft: state?.roundSeconds ?? 60, expired: false }
  }
  const startedAt = new Date(state.turnStartedAt).getTime()
  const msUntilStart = startedAt - now

  if (msUntilStart > 0) {
    return {
      countdown: Math.max(1, Math.ceil(msUntilStart / 1000)),
      timeLeft: state.roundSeconds,
      expired: false,
    }
  }

  const elapsed = Math.floor((now - startedAt) / 1000)
  const timeLeft = state.roundSeconds - elapsed
  return { countdown: 0, timeLeft: Math.max(0, timeLeft), expired: timeLeft <= 0 }
}

export function cardsFor(state: HeadsUpState, playerId: string): HeadsUpCardResult[] {
  return state.results[playerId] ?? []
}

export function scoreFor(state: HeadsUpState, playerId: string): number {
  return cardsFor(state, playerId).filter((c) => c.got).length
}

/** The word this player is on, given how many cards they have already decided. */
export function wordFor(state: HeadsUpState, playerId: string): string | null {
  const used = cardsFor(state, playerId).length
  return state.words[state.cardIndex + used] ?? null
}

/** Puts a turn live: fresh card results for the guesser and a start time everyone shares. */
export function startTurn(room: Room, turnIndex: number): Room {
  const state = room.headsUp
  if (!state) return room
  const guesser = state.order[turnIndex]
  if (!guesser) return room

  return {
    ...room,
    status: 'question',
    responses: {},
    lastGain: {},
    headsUp: {
      ...state,
      turnIndex,
      // Carry on through the deck rather than repeating words the room has seen.
      cardIndex: state.cardIndex,
      turnStartedAt: new Date(Date.now() + LEAD_IN_SECONDS * 1000).toISOString(),
      results: { ...state.results, [guesser]: [] },
    },
  }
}

/** Records one decision for the guesser. Called on every tilt or tap. */
export function recordCard(room: Room, playerId: string, word: string, got: boolean): Room {
  const state = room.headsUp
  if (!state) return room
  return {
    ...room,
    headsUp: {
      ...state,
      results: {
        ...state.results,
        [playerId]: [...cardsFor(state, playerId), { word, got }],
      },
    },
  }
}

/**
 * Ends the live turn: the guesser banks one point per correct card, the deck
 * pointer moves past everything they saw, and the room shows the summary.
 */
export function endTurn(room: Room): Room {
  const state = room.headsUp
  const guesser = currentGuesserId(room)
  if (!state || !guesser) return room

  const seen = cardsFor(state, guesser)
  const gain = seen.filter((c) => c.got).length

  const players: Player[] = room.players.map((p) =>
    p.id === guesser ? { ...p, score: p.score + gain } : p,
  )

  return {
    ...room,
    players,
    lastGain: { [guesser]: gain },
    status: 'results',
    headsUp: {
      ...state,
      cardIndex: state.cardIndex + seen.length,
      turnStartedAt: undefined,
    },
  }
}

/** Next player up, or the leaderboard once everyone has had a go. */
export function advanceTurn(room: Room): Room {
  const state = room.headsUp
  if (!state) return room
  const nextIndex = state.turnIndex + 1
  if (nextIndex >= state.order.length) {
    return { ...room, status: 'final' }
  }
  return startTurn(room, nextIndex)
}

/**
 * Reconciles two copies of the same room before a turn is scored.
 *
 * The guesser's device writes a card on every tilt or tap, and the host polls;
 * ending a turn a beat after a fast final tap would otherwise score against a
 * stale copy and quietly lose the guesser a point. Cards only ever get added
 * within a turn, so the longer list is always the newer one.
 */
export function mergeTurnResults(a: Room, b: Room): Room {
  if (!a.headsUp || !b.headsUp) return a.headsUp ? a : b
  const base = b.headsUp.turnStartedAt === a.headsUp.turnStartedAt ? b : a
  const other = base === b ? a : b
  if (!base.headsUp || !other.headsUp) return base

  const results = { ...base.headsUp.results }
  for (const [playerId, cards] of Object.entries(other.headsUp.results)) {
    if ((results[playerId]?.length ?? 0) < cards.length) results[playerId] = cards
  }
  return { ...base, headsUp: { ...base.headsUp, results } }
}

/** True when the deck cannot fill another card for this player. */
export function deckExhausted(state: HeadsUpState, playerId: string): boolean {
  return wordFor(state, playerId) === null
}
