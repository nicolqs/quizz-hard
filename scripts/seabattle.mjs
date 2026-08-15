#!/usr/bin/env node
/* eslint-disable no-console */
// Sea Battle end-to-end, against a real database.
//
// Unlike the other multiplayer tests this one cannot stub the API: shots are
// resolved on the server against fleets that never leave it, so a stub would be
// testing the stub. Point it at a dev server with a real DATABASE_URL, or at the
// deployment.
//
//   BASE_URL=https://nixgames.vercel.app node scripts/seabattle.mjs
//
// The room it creates is printed at the end.

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'

const log = (msg) => console.log(`[seabattle-e2e] ${msg}`)
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

const waitForText = (page, needle, timeout = 25000) =>
  page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    needle,
    { timeout },
  )

const fetchRoom = async (code) => (await fetch(`${BASE}/api/rooms/${code}`)).json()
const fetchSea = async (code, playerId) =>
  (await fetch(`${BASE}/api/rooms/${code}/sea-battle?playerId=${playerId}`)).json()

async function main() {
  log(`target: ${BASE}`)
  const browser = await chromium.launch({ headless: true })
  const contexts = []
  let code = null

  try {
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext({
        viewport: { width: 420, height: 900 },
        permissions: ['clipboard-read', 'clipboard-write'],
      })
      const page = await ctx.newPage()
      page.on('pageerror', (e) => console.error(`[dev${i} pageerror]`, e.message))
      contexts.push({ ctx, page })
    }
    const [host, guest] = contexts.map((c) => c.page)

    // ---------------------------------------------------------------- setup
    await host.goto(`${BASE}/admin`)
    await waitForText(host, 'Host setup')
    await host.getByRole('button', { name: /Sea Battle/i }).first().click()
    await host.getByRole('button', { name: 'Generate Room' }).click()
    await waitForText(host, 'Room Code')
    code = await host.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem('nix-games-rooms')))[0],
    )
    log(`room ${code} created`)

    await guest.goto(`${BASE}/?code=${code}`)
    await waitForText(guest, 'Join a lobby')
    await guest.fill('input[placeholder="Your name"]', 'Guest')
    await guest.getByRole('button', { name: 'Join Room' }).click()
    await waitForText(guest, 'Lobby status')
    await host.waitForFunction(() => document.body.innerText.includes('Guest'), null, { timeout: 25000 })

    await host.getByRole('button', { name: /Start the battle/i }).click()
    await waitForText(host, 'Place your fleet')
    await waitForText(guest, 'Place your fleet')
    log('both players are placing fleets')

    const room = await fetchRoom(code)
    const [hostId, guestId] = room.seaBattle.playerIds

    // -------------------------------------------------- fleets stay private
    for (const page of [host, guest]) {
      await page.getByRole('button', { name: 'Scatter' }).click()
      await page.getByRole('button', { name: 'Ready' }).click()
    }
    await host.waitForFunction(() => /your shot|aiming/i.test(document.body.innerText), null, {
      timeout: 25000,
    })
    log('both fleets accepted, battle started')

    const publicRoom = await fetchRoom(code)
    const serialised = JSON.stringify(publicRoom)
    assert(!serialised.includes('placements'), 'the room payload contains no ship positions at all')
    log('the room payload leaks no ship positions')

    const asGuest = await fetchSea(code, guestId)
    assert(asGuest.boards[guestId]?.placements?.length === 5, 'a player can fetch their own fleet')
    assert(!asGuest.boards[hostId], "a player cannot fetch their opponent's fleet")
    log('the fleet endpoint returns only your own ships')

    // ------------------------------------------------------------- shooting
    const state = (await fetchRoom(code)).seaBattle
    const firstMover = state.turn
    assert(firstMover, 'somebody has the first shot')

    // Fire at the opponent's fleet from the server's point of view: walk the
    // grid until something is hit, then confirm the turn logic.
    const shooter = firstMover === hostId ? host : guest
    const shooterId = firstMover
    const opponentId = firstMover === hostId ? guestId : hostId
    const opponentFleet = (await fetchSea(code, opponentId)).boards[opponentId]
    const shipCells = opponentFleet.placements.flatMap((p) => {
      const length = { carrier: 4, cruiser: 3, submarine: 3, destroyer: 2, patrol: 2 }[p.shipId]
      return Array.from({ length }, (_, i) => ({
        x: p.x + (p.horizontal ? i : 0),
        y: p.y + (p.horizontal ? 0 : i),
      }))
    })

    const columns = 'ABCDEFGH'
    const target = shipCells[0]
    await shooter.getByRole('button', { name: `Fire ${columns[target.x]}${target.y + 1}` }).click()
    await shooter.waitForTimeout(1500)

    const afterHit = (await fetchRoom(code)).seaBattle
    assert(afterHit.shots.length === 1, 'the shot was recorded server-side')
    assert(afterHit.shots[0].result !== 'miss', 'firing at a known ship cell hits')
    assert(afterHit.turn === shooterId, 'a hit keeps the turn')
    log(`hit at ${columns[target.x]}${target.y + 1}, and the shooter keeps the turn`)

    // Now find open water and confirm the turn changes hands.
    const occupied = new Set(shipCells.map((c) => `${c.x},${c.y}`))
    const water = []
    for (let x = 0; x < 8 && water.length === 0; x++) {
      for (let y = 0; y < 8; y++) {
        if (!occupied.has(`${x},${y}`)) {
          water.push({ x, y })
          break
        }
      }
    }
    await shooter.getByRole('button', { name: `Fire ${columns[water[0].x]}${water[0].y + 1}` }).click()
    await shooter.waitForTimeout(1500)

    const afterMiss = (await fetchRoom(code)).seaBattle
    assert(afterMiss.shots.length === 2, 'the second shot was recorded')
    assert(afterMiss.shots[1].result === 'miss', 'open water is a miss')
    assert(afterMiss.turn === opponentId, 'a miss hands the turn over')
    log('miss recorded, and the turn passed to the opponent')

    // ---------------------------------------------------- server says no
    const stolen = await fetch(`${BASE}/api/rooms/${code}/sea-battle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'fire', playerId: shooterId, x: 7, y: 7 }),
    })
    assert(stolen.status === 409, `firing out of turn is refused, got ${stolen.status}`)

    const repeat = await fetch(`${BASE}/api/rooms/${code}/sea-battle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'fire', playerId: opponentId, x: target.x, y: target.y }),
    })
    const repeatBody = await repeat.json()
    // The opponent has not fired here yet, so this one is legal for them.
    assert(repeat.ok, `the other player may fire at the same coordinates: ${repeatBody.error ?? ''}`)
    log('out-of-turn shots are refused by the server')

    // A hostile client cannot save an illegal fleet either.
    const cheat = await fetch(`${BASE}/api/rooms/${code}/sea-battle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'board',
        playerId: guestId,
        board: { placements: [{ shipId: 'carrier', x: 0, y: 0, horizontal: true }] },
      }),
    })
    assert(cheat.status >= 400, `an incomplete fleet is rejected, got ${cheat.status}`)
    log('the server re-validates fleets rather than trusting the client')

    log(`\n✅ all Sea Battle end-to-end assertions passed (room ${code})`)
  } finally {
    for (const { ctx } of contexts) await ctx.close().catch(() => {})
    await browser.close().catch(() => {})
    if (code) console.log(`[seabattle-e2e] room to clean up: ${code}`)
  }
}

main().catch((err) => {
  console.error('\n❌', err.message)
  process.exit(1)
})
