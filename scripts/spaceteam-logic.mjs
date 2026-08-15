#!/usr/bin/env node
/* eslint-disable no-console */
// Spaceteam logic tests. No browser, no database, no API key: the game rules
// are pure functions, so they get tested directly and deterministically.
//
// Run with: node scripts/spaceteam-logic.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'

// Node 20 cannot import TypeScript directly, so strip the types with the
// compiler that already ships in devDependencies. tsc --noEmit does the actual
// type checking; this only needs runnable JavaScript.
const source = fs.readFileSync(new URL('../lib/spaceteam.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const compiled = path.join(os.tmpdir(), `spaceteam-${process.pid}.mjs`)
fs.writeFileSync(compiled, js)
process.on('exit', () => fs.rmSync(compiled, { force: true }))

const log = (msg) => console.log(`[spaceteam] ${msg}`)
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

const {
  advance,
  buildPanels,
  initialState,
  nextInstruction,
  rng,
  CONTROLS_PER_PLAYER,
  HULL_DAMAGE,
  MAX_HULL,
  PER_LEVEL,
  secondsForLevel,
} = await import(`file://${compiled}`)

const PLAYERS = ['p1', 'p2', 'p3']
const NAMES = { p1: 'Alice', p2: 'Bob', p3: 'Carol' }
const T0 = 1_000_000

function main() {
  // ---------------------------------------------------------------- panels
  const panels = buildPanels(PLAYERS, 42)
  assert(Object.keys(panels).length === 3, 'one panel per player')
  for (const id of PLAYERS) {
    assert(panels[id].length === CONTROLS_PER_PLAYER, `${id} has ${CONTROLS_PER_PLAYER} controls`)
  }

  const names = Object.values(panels).flat().map((c) => c.name)
  assert(new Set(names).size === names.length, 'every control name is unique across the ship')

  const ids = Object.values(panels).flat().map((c) => c.id)
  assert(new Set(ids).size === ids.length, 'every control id is unique')

  const types = new Set(Object.values(panels).flat().map((c) => c.type))
  assert(types.size >= 3, `panels mix control types, saw ${[...types]}`)
  log(`panels: 3 × ${CONTROLS_PER_PLAYER} controls, all names unique`)

  // Same seed, same ship. Different seed, different ship.
  assert(
    JSON.stringify(buildPanels(PLAYERS, 42)) === JSON.stringify(panels),
    'panel generation is deterministic for a seed',
  )
  assert(
    JSON.stringify(buildPanels(PLAYERS, 43)) !== JSON.stringify(panels),
    'a different seed builds a different ship',
  )
  log('panel generation is deterministic')

  // ---------------------------------------------------------------- instructions
  const state = initialState(PLAYERS, 7, T0)
  assert(Object.keys(state.instructions).length === 3, 'everyone starts with an instruction')
  assert(state.hull === MAX_HULL, 'full hull at launch')

  // The whole point: instructions mostly belong to someone else's panel.
  const random = rng(99)
  let elsewhere = 0
  for (let i = 0; i < 300; i++) {
    const instruction = nextInstruction(state, 'p1', T0, random)
    if (instruction.ownerId !== 'p1') elsewhere++
  }
  assert(elsewhere > 240, `most instructions target another panel, got ${elsewhere}/300`)
  log(`${Math.round((elsewhere / 300) * 100)}% of instructions are for somebody else's panel`)

  // A target value is always reachable on the named control.
  for (let i = 0; i < 200; i++) {
    const instruction = nextInstruction(state, 'p2', T0, random)
    const control = state.panels[instruction.ownerId].find((c) => c.id === instruction.controlId)
    assert(control, 'instruction names a real control')
    assert(
      instruction.targetValue >= 0 && instruction.targetValue <= Math.max(control.max, 0),
      `target ${instruction.targetValue} is within 0..${control.max} for a ${control.type}`,
    )
    if (control.type === 'button') assert(instruction.targetValue === 0, 'buttons have no value')
  }
  log('instructions always name a real control and a reachable value')

  // ---------------------------------------------------------------- a correct action
  const target = state.instructions.p1
  const acted = advance(
    { ...state, pending: [{ seq: 1, playerId: target.ownerId, controlId: target.controlId, value: target.targetValue }] },
    T0 + 1000,
    NAMES,
  )
  assert(acted.changed, 'a matching action changes the state')
  assert(acted.state.completed === 1, 'the instruction counts as completed')
  assert(acted.state.hull === MAX_HULL, 'a success costs no hull')
  assert(acted.state.instructions.p1.id !== target.id, 'the reader gets a fresh instruction')
  assert(acted.state.pending.length === 0, 'the action queue is drained')
  log('a correct action clears the instruction it satisfies, whoever is holding it')

  // ---------------------------------------------------------------- a wrong action
  const wrongValue = target.targetValue === 1 ? 2 : 1
  const wrong = advance(
    { ...state, pending: [{ seq: 1, playerId: target.ownerId, controlId: target.controlId, value: wrongValue }] },
    T0 + 1000,
    NAMES,
  )
  assert(wrong.state.completed === 0, 'a wrong value completes nothing')
  assert(wrong.state.hull === MAX_HULL, 'a wrong value does not damage the ship either')
  assert(wrong.state.instructions.p1.id === target.id, 'the instruction still stands')
  log('a wrong value neither completes nor punishes, it just does nothing')

  // Somebody else pressing the right-looking control on their own panel does nothing.
  const impostor = advance(
    { ...state, pending: [{ seq: 1, playerId: 'p3', controlId: target.controlId, value: target.targetValue }] },
    T0 + 1000,
    NAMES,
  )
  const wasP3sOwn = target.ownerId === 'p3'
  assert(
    wasP3sOwn ? impostor.state.completed === 1 : impostor.state.completed === 0,
    'only the player who owns the control can satisfy the instruction',
  )
  log('only the owner of a control can carry out its instruction')

  // ---------------------------------------------------------------- expiry
  const expired = advance(state, T0 + 60_000, NAMES)
  assert(expired.state.hull === MAX_HULL - HULL_DAMAGE * 3, `all three expiries damage the hull`)
  assert(
    Object.values(expired.state.instructions).every((i) => i.expiresAt > T0 + 60_000),
    'expired instructions are replaced with live ones',
  )
  assert(expired.state.log.some((l) => !l.good), 'a miss is logged')
  log(`expiry costs ${HULL_DAMAGE} hull each and reissues`)

  // ---------------------------------------------------------------- levels
  let levelling = { ...state, levelProgress: PER_LEVEL - 1, level: 1 }
  const readerId = 'p2'
  const instruction = levelling.instructions[readerId]
  levelling = advance(
    {
      ...levelling,
      pending: [
        {
          seq: 1,
          playerId: instruction.ownerId,
          controlId: instruction.controlId,
          value: instruction.targetValue,
        },
      ],
    },
    T0 + 500,
    NAMES,
  ).state
  assert(levelling.level === 2, `clearing ${PER_LEVEL} advances the level, got ${levelling.level}`)
  assert(secondsForLevel(2) < secondsForLevel(1), 'each level shortens the fuse')
  log(`level 1 gives ${secondsForLevel(1)}s per instruction, level 5 gives ${secondsForLevel(5)}s`)

  // ---------------------------------------------------------------- losing
  let sinking = { ...state, hull: HULL_DAMAGE }
  sinking = advance(sinking, T0 + 60_000, NAMES).state
  assert(sinking.outcome === 'lost', 'the ship is lost when the hull runs out')
  assert(sinking.hull === 0, 'hull floors at zero rather than going negative')
  const afterLoss = advance(sinking, T0 + 120_000, NAMES)
  assert(!afterLoss.changed, 'a lost game stops ticking')
  log('the ship explodes at zero hull and the game stops')

  // ---------------------------------------------------------------- winning
  const nearlyThere = { ...state, level: 5, levelProgress: PER_LEVEL - 1 }
  const last = nearlyThere.instructions.p3
  const won = advance(
    {
      ...nearlyThere,
      pending: [{ seq: 1, playerId: last.ownerId, controlId: last.controlId, value: last.targetValue }],
    },
    T0 + 500,
    NAMES,
  ).state
  assert(won.outcome === 'won', 'clearing the final level wins the run')
  log('clearing the final level wins')

  log('\n✅ all Spaceteam logic assertions passed')
}

main()
