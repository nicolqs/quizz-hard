export function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase()
}

export function generatePlayerId(prefix: string = 'player'): string {
  return `${prefix}-${Date.now()}`
}

