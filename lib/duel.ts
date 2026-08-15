// One phone, two players, one screen split in half.
//
// Player 1 sits at the top and their half is rotated 180 degrees so the text
// faces them. Player 2 sits at the bottom. Neither needs a room code, an
// account or a network connection: everything here runs on the one device.

export type DuelPlayer = 1 | 2

export type DuelGameId = 'pong' | 'sumo' | 'reaction'

export type DuelGame = {
  id: DuelGameId
  name: string
  emoji: string
  blurb: string
  /** Shown on the "get ready" card before the first point. */
  howTo: string
}

export const duelGames: DuelGame[] = [
  {
    id: 'pong',
    name: 'Ping Pong',
    emoji: '🏓',
    blurb: 'Classic rally. Miss the ball and they take the point.',
    howTo: 'Slide your thumb along your half to move your paddle.',
  },
  {
    id: 'sumo',
    name: 'Sumo',
    emoji: '🥋',
    blurb: 'Shove the other disc out of the ring.',
    howTo: 'Press and drag anywhere in your half. Your disc thrusts the way you drag.',
  },
  {
    id: 'reaction',
    name: 'Reaction',
    emoji: '⚡',
    blurb: 'Wait for green, then be first. Tap early and you lose the point.',
    howTo: 'Hands off until the screen turns green, then slam your half.',
  },
]

export const getDuelGame = (id: DuelGameId) => duelGames.find((g) => g.id === id)!

/** Best of five: first to three points takes the match. */
export const POINTS_TO_WIN = 3

export type DuelScore = { 1: number; 2: number }

export const emptyScore = (): DuelScore => ({ 1: 0, 2: 0 })

export function matchWinner(score: DuelScore): DuelPlayer | null {
  if (score[1] >= POINTS_TO_WIN) return 1
  if (score[2] >= POINTS_TO_WIN) return 2
  return null
}

export const otherPlayer = (p: DuelPlayer): DuelPlayer => (p === 1 ? 2 : 1)

/** Player 1 reads their half upside down, so their colour anchors which is which. */
export const playerColor: Record<DuelPlayer, string> = {
  1: '#f472b6', // pink, top
  2: '#22d3ee', // cyan, bottom
}

export const playerName: Record<DuelPlayer, string> = {
  1: 'Pink',
  2: 'Cyan',
}
