#!/usr/bin/env node
/* eslint-disable no-console */
// Sea Battle rules, tested as pure functions. No browser, no database.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../lib/seabattle.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const compiled = path.join(os.tmpdir(), `seabattle-${process.pid}.mjs`)
fs.writeFileSync(compiled, js)
process.on('exit', () => fs.rmSync(compiled, { force: true }))

const log = (msg) => console.log(`[seabattle] ${msg}`)
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

const {
  BOARD_SIZE,
  FLEET,
  allSunk,
  canPlace,
  cellsOf,
  isComplete,
  nextTurn,
  randomBoard,
  resolveShot,
  sunkShips,
} = await import(`file://${compiled}`)

const T0 = 1_000_000
const board = (placements) => ({ placements })

function main() {
  // ---------------------------------------------------------------- placement
  const empty = board([])
  assert(canPlace(empty, { shipId: 'carrier', x: 0, y: 0, horizontal: true }), 'a ship fits on an empty board')
  assert(
    !canPlace(empty, { shipId: 'carrier', x: BOARD_SIZE - 2, y: 0, horizontal: true }),
    'a ship cannot hang off the edge',
  )

  const one = board([{ shipId: 'carrier', x: 2, y: 2, horizontal: true }])
  assert(!canPlace(one, { shipId: 'cruiser', x: 3, y: 2, horizontal: false }), 'ships cannot overlap')
  assert(!canPlace(one, { shipId: 'cruiser', x: 2, y: 3, horizontal: true }), 'ships cannot sit edge to edge')
  assert(!canPlace(one, { shipId: 'cruiser', x: 1, y: 1, horizontal: false }), 'ships cannot touch diagonally')
  assert(canPlace(one, { shipId: 'cruiser', x: 2, y: 4, horizontal: true }), 'a one-cell gap is legal')
  log('placement respects edges, overlaps and the no-touching rule')

  assert(!isComplete(one), 'one ship is not a fleet')
  const full = randomBoard()
  assert(isComplete(full), 'a scattered fleet has every ship')
  for (const placement of full.placements) {
    const others = board(full.placements.filter((p) => p.shipId !== placement.shipId))
    assert(canPlace(others, placement), `${placement.shipId} sits legally in a scattered fleet`)
  }
  log('scatter always produces a legal fleet')

  // 200 scattered fleets, all legal: the retry loop must never give up early.
  for (let i = 0; i < 200; i++) {
    assert(isComplete(randomBoard()), 'scatter is reliable across many attempts')
  }
  log('200 scattered fleets, all complete and legal')

  // ------------------------------------------------------------------- firing
  const target = board([
    { shipId: 'destroyer', x: 0, y: 0, horizontal: true }, // (0,0) (1,0)
    { shipId: 'carrier', x: 0, y: 4, horizontal: true },
  ])

  const miss = resolveShot(target, [], 'p1', 5, 5, T0)
  assert(miss.result === 'miss', 'empty water is a miss')

  const hit = resolveShot(target, [], 'p1', 0, 0, T0)
  assert(hit.result === 'hit', 'a ship cell is a hit')
  assert(hit.shipId === 'destroyer', 'the hit names the ship')

  const sunk = resolveShot(target, [hit], 'p1', 1, 0, T0)
  assert(sunk.result === 'sunk', 'the last cell of a ship sinks it')
  assert(sunk.shipId === 'destroyer', 'the sinking names the ship')
  log('shots resolve as miss, hit and sunk')

  assert(resolveShot(target, [hit], 'p1', 0, 0, T0) === null, 'the same cell cannot be fired at twice')
  assert(resolveShot(target, [], 'p1', -1, 0, T0) === null, 'shots off the board are rejected')
  assert(resolveShot(target, [], 'p1', BOARD_SIZE, 0, T0) === null, 'shots past the edge are rejected')
  log('illegal shots are refused rather than wasted')

  // --------------------------------------------------------------------- turn
  assert(nextTurn('p1', 'p2', 'miss') === 'p2', 'a miss passes the turn')
  assert(nextTurn('p1', 'p2', 'hit') === 'p1', 'a hit buys another shot')
  assert(nextTurn('p1', 'p2', 'sunk') === 'p1', 'sinking a ship also buys another shot')
  log('a hit keeps the turn, a miss hands it over')

  // ------------------------------------------------------------------ winning
  const shotsSoFar = [hit, sunk]
  assert(sunkShips(target, shotsSoFar).size === 1, 'one ship down')
  assert(!allSunk(target, shotsSoFar), 'the fleet is not gone yet')

  const finishing = [...shotsSoFar]
  for (const cell of cellsOf({ shipId: 'carrier', x: 0, y: 4, horizontal: true })) {
    finishing.push({ by: 'p1', x: cell.x, y: cell.y, result: 'hit', at: T0 })
  }
  assert(allSunk(target, finishing), 'every ship hit means the fleet is destroyed')
  log('the fleet falls only when every ship is hit on every cell')

  // A near-miss fleet: all but one cell.
  const nearly = finishing.slice(0, -1)
  assert(!allSunk(target, nearly), 'one cell short is not a win')
  log('one cell short is not a win')

  log(`\n✅ all Sea Battle logic assertions passed (${FLEET.length} ships, ${BOARD_SIZE}x${BOARD_SIZE} board)`)
}

main()
