// Spaceteam: everyone gets a control panel, and the instruction on your screen
// is almost always for somebody else's panel. The only way through is to shout.
//
// Everything in this file is pure. The host device runs `advance()` on a timer
// and writes the result back to the room; every other device just renders the
// state and posts the controls it touches.

export type ControlType = 'button' | 'toggle' | 'slider' | 'dial'

export type Control = {
  id: string
  name: string
  type: ControlType
  /** Buttons have no value. Toggles are 0 or 1. Sliders and dials go 0..max. */
  max: number
}

export type Instruction = {
  id: string
  /** The player reading it. Usually not the one who can carry it out. */
  readerId: string
  /** Whose panel the control sits on. */
  ownerId: string
  controlId: string
  text: string
  targetValue: number
  issuedAt: number
  expiresAt: number
}

export type SpaceteamAction = {
  seq: number
  playerId: string
  controlId: string
  value: number
}

export type SpaceteamState = {
  seed: number
  panels: Record<string, Control[]>
  instructions: Record<string, Instruction>
  /** Appended to atomically by players, drained by the host. */
  pending: SpaceteamAction[]
  hull: number
  level: number
  completed: number
  /** Instructions completed in the current level. */
  levelProgress: number
  startedAt: number
  outcome: 'flying' | 'won' | 'lost'
  /** Short log the whole room can read, newest first. */
  log: { text: string; good: boolean; at: number }[]
}

// ---------------------------------------------------------------- tuning
export const MAX_HULL = 100
export const HULL_DAMAGE = 14
export const CONTROLS_PER_PLAYER = 6
export const PER_LEVEL = 8 // instructions to clear a level
export const FINAL_LEVEL = 5
export const START_SECONDS = 12
export const MIN_SECONDS = 5
export const LOG_LENGTH = 6

export const secondsForLevel = (level: number) =>
  Math.max(MIN_SECONDS, START_SECONDS - (level - 1) * 1.5)

// ---------------------------------------------------------------- vocabulary
// Technobabble is the whole joke: the words must be hard to mishear and
// ridiculous to shout across a room.
const ADJECTIVES = [
  'Clip-jawed', 'Beveled', 'Quantum', 'Reticulated', 'Molten', 'Inverted',
  'Turbo', 'Cryogenic', 'Gilded', 'Warp', 'Sub-etheric', 'Fizzy',
  'Serrated', 'Bilious', 'Photonic', 'Pneumatic', 'Rusty', 'Baroque',
]

const NOUNS = [
  'Fluxtrunion', 'Nanobuzzer', 'Gravcoupler', 'Dynotherm', 'Vectorizer',
  'Squibblator', 'Thrustbucket', 'Cryoslider', 'Wobbulator', 'Plasmavalve',
  'Muonspanner', 'Bilgepump', 'Zorptrap', 'Hyperclamp', 'Neutrino Sieve',
  'Spindlewhorl', 'Gyrodyne', 'Antimatter Whisk',
]

// ---------------------------------------------------------------- rng
/** Deterministic RNG so a seed replays identically, which makes tests possible. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(random: () => number, items: T[]): T => items[Math.floor(random() * items.length)]

// ---------------------------------------------------------------- panels
/** One panel per player, with globally unique names so a shout is unambiguous. */
export function buildPanels(playerIds: string[], seed: number): Record<string, Control[]> {
  const random = rng(seed)
  const used = new Set<string>()
  const panels: Record<string, Control[]> = {}

  const nextName = () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const name = `${pick(random, ADJECTIVES)} ${pick(random, NOUNS)}`
      if (!used.has(name)) {
        used.add(name)
        return name
      }
    }
    // Pool exhausted (a lot of players): number them rather than repeat.
    const name = `Auxiliary Unit ${used.size + 1}`
    used.add(name)
    return name
  }

  playerIds.forEach((playerId, playerIndex) => {
    const controls: Control[] = []
    for (let i = 0; i < CONTROLS_PER_PLAYER; i++) {
      // A fixed spread per panel so nobody ends up with six identical dials.
      const type: ControlType = i < 2 ? 'button' : i < 3 ? 'toggle' : i < 5 ? 'slider' : 'dial'
      controls.push({
        id: `${playerIndex}-${i}`,
        name: nextName(),
        type,
        max: type === 'button' ? 0 : type === 'toggle' ? 1 : type === 'slider' ? 4 : 8,
      })
    }
    panels[playerId] = controls
  })

  return panels
}

// ---------------------------------------------------------------- instructions
function phrase(control: Control, value: number): string {
  switch (control.type) {
    case 'button':
      return `Press the ${control.name}`
    case 'toggle':
      return `${value === 1 ? 'Engage' : 'Disengage'} the ${control.name}`
    case 'slider':
      return `Set ${control.name} to ${value}`
    default:
      return `Dial ${control.name} to ${value}`
  }
}

/**
 * Builds the next instruction for one player.
 *
 * It deliberately prefers a control on somebody else's panel: an instruction you
 * can carry out yourself is a quiet moment, and quiet is not the point.
 */
export function nextInstruction(
  state: Pick<SpaceteamState, 'panels' | 'level'>,
  readerId: string,
  now: number,
  random: () => number,
): Instruction {
  const owners = Object.keys(state.panels)
  const others = owners.filter((id) => id !== readerId)
  // 85% of the time the control belongs to someone else, when there is someone else.
  const ownerId = others.length && random() < 0.85 ? pick(random, others) : pick(random, owners)
  const control = pick(random, state.panels[ownerId])

  let targetValue = 0
  if (control.type === 'toggle') targetValue = random() < 0.5 ? 0 : 1
  else if (control.max > 0) targetValue = 1 + Math.floor(random() * control.max)

  const seconds = secondsForLevel(state.level)
  return {
    id: `${readerId}-${now}-${Math.floor(random() * 1e6)}`,
    readerId,
    ownerId,
    controlId: control.id,
    text: phrase(control, targetValue),
    targetValue,
    issuedAt: now,
    expiresAt: now + seconds * 1000,
  }
}

export function initialState(playerIds: string[], seed: number, now: number): SpaceteamState {
  const panels = buildPanels(playerIds, seed)
  const random = rng(seed + 1)
  const base: SpaceteamState = {
    seed,
    panels,
    instructions: {},
    pending: [],
    hull: MAX_HULL,
    level: 1,
    completed: 0,
    levelProgress: 0,
    startedAt: now,
    outcome: 'flying',
    log: [],
  }
  for (const playerId of playerIds) {
    base.instructions[playerId] = nextInstruction(base, playerId, now, random)
  }
  return base
}

const addLog = (state: SpaceteamState, text: string, good: boolean, at: number) => {
  state.log = [{ text, good, at }, ...state.log].slice(0, LOG_LENGTH)
}

/**
 * One host tick: drain the actions players posted, expire anything overdue, and
 * hand out replacements. Pure, so the whole game can be tested without a browser.
 */
export function advance(
  previous: SpaceteamState,
  now: number,
  playerNames: Record<string, string> = {},
): { state: SpaceteamState; changed: boolean } {
  if (previous.outcome !== 'flying') return { state: previous, changed: false }

  const state: SpaceteamState = {
    ...previous,
    instructions: { ...previous.instructions },
    pending: [],
    log: [...previous.log],
  }
  const random = rng(Math.floor(now) ^ previous.seed)
  let changed = previous.pending.length > 0

  const nameOf = (id: string) => playerNames[id] ?? 'Someone'

  // 1. Actions. An action clears whichever instruction it satisfies, whoever is
  //    holding it, which is what makes shouting across the room work.
  for (const action of previous.pending) {
    const match = Object.values(state.instructions).find(
      (instruction) =>
        instruction.controlId === action.controlId &&
        instruction.targetValue === action.value &&
        action.playerId === instruction.ownerId,
    )
    if (!match) continue

    state.completed += 1
    state.levelProgress += 1
    addLog(state, `${nameOf(match.readerId)}: ${match.text} ✓`, true, now)
    state.instructions[match.readerId] = nextInstruction(state, match.readerId, now, random)
    changed = true
  }

  // 2. Anything that ran out of time damages the hull.
  for (const [readerId, instruction] of Object.entries(state.instructions)) {
    if (now < instruction.expiresAt) continue
    state.hull -= HULL_DAMAGE
    addLog(state, `Missed: ${instruction.text}`, false, now)
    state.instructions[readerId] = nextInstruction(state, readerId, now, random)
    changed = true
  }

  // 3. Level up, and speed everything up with it.
  while (state.levelProgress >= PER_LEVEL && state.level < FINAL_LEVEL) {
    state.levelProgress -= PER_LEVEL
    state.level += 1
    addLog(state, `Level ${state.level}. Everything is faster now.`, true, now)
    changed = true
  }

  if (state.hull <= 0) {
    state.hull = 0
    state.outcome = 'lost'
    changed = true
  } else if (state.level >= FINAL_LEVEL && state.levelProgress >= PER_LEVEL) {
    state.outcome = 'won'
    changed = true
  }

  return { state, changed }
}

/** What a single device needs to draw itself. */
export function viewFor(state: SpaceteamState, playerId: string) {
  return {
    panel: state.panels[playerId] ?? [],
    instruction: state.instructions[playerId] ?? null,
  }
}
