#!/usr/bin/env node
/* eslint-disable no-console */
// Live multiplayer test. No stubs at all.
//
// The other scripts intercept /api/rooms and force SSE to fail, which exercises
// the polling path against an in-process map. This one runs three independent
// browser contexts against a real deployment: real Postgres, real Server-Sent
// Events, real latency. That is the only configuration a party actually uses,
// and it is where a bug like "the SSE payload forgot a field" hides.
//
//   BASE_URL=https://nixgames.vercel.app node scripts/live-multiplayer.mjs
//
// It creates real rooms. Their codes are printed at the end so they can be
// deleted, and they expire from usefulness immediately anyway.

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://nixgames.vercel.app'

const log = (msg) => console.log(`[live] ${msg}`)
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

const createdRooms = []

const waitForText = (page, needle, timeout = 25000) =>
  page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    needle,
    { timeout },
  )

/** Reads room state over HTTP, the same way a real client would. */
async function fetchRoom(code) {
  const res = await fetch(`${BASE}/api/rooms/${code}`)
  if (!res.ok) throw new Error(`room fetch failed: ${res.status}`)
  return res.json()
}

async function makeDevice(browser, label) {
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error(`[${label} pageerror]`, e.message))
  return { context, page }
}

/** Confirms the live-update transport is SSE rather than the polling fallback. */
async function sseIsLive(page) {
  return page.evaluate(async () => {
    const code = new URLSearchParams(location.search).get('code')
    if (!code) return false
    return new Promise((resolve) => {
      const source = new EventSource(`/api/rooms-stream/${code}`)
      const done = (value) => {
        source.close()
        resolve(value)
      }
      source.onmessage = () => done(true)
      source.onerror = () => done(false)
      setTimeout(() => done(false), 8000)
    })
  })
}

async function headsUp(browser) {
  log('--- Heads Up, three devices, live ---')
  const devices = await Promise.all([
    makeDevice(browser, 'host'),
    makeDevice(browser, 'alice'),
    makeDevice(browser, 'bob'),
  ])
  const [host, alice, bob] = devices.map((d) => d.page)

  try {
    await host.goto(`${BASE}/admin`)
    await waitForText(host, 'Host setup')
    await host.getByRole('button', { name: /Heads Up/i }).first().click()
    await host.getByRole('button', { name: /Animals/i }).first().click()
    await host.getByRole('button', { name: '30s', exact: true }).click()
    await host.getByRole('button', { name: 'Generate Room' }).click()
    await waitForText(host, 'Room Code')

    const code = await host.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem('nix-games-rooms')))[0],
    )
    createdRooms.push(code)
    log(`room ${code} created against the live database`)

    // It really is in Postgres, not just in this browser's localStorage.
    const stored = await fetchRoom(code)
    assert(stored.gameMode === 'headsup', 'the room persisted as a headsup room')
    assert(stored.headsUp?.roundSeconds === 30, 'round length round-tripped through the database')

    for (const [page, name] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
    ]) {
      await page.goto(`${BASE}/?code=${code}`)
      await waitForText(page, 'Join a lobby')
      await page.fill('input[placeholder="Your name"]', name)
      await page.getByRole('button', { name: 'Join Room' }).click()
      await waitForText(page, 'Lobby status')
    }

    const usingSse = await sseIsLive(alice)
    log(usingSse ? 'alice is on the SSE stream, not polling' : 'SSE unavailable, clients fell back to polling')

    await host.waitForFunction(
      (n) => n.every((name) => document.body.innerText.includes(name)),
      ['Alice', 'Bob'],
      { timeout: 25000 },
    )
    log('host sees both players over the live transport')

    await host.getByRole('button', { name: /Start Heads Up/i }).click()
    await host.waitForFunction(() => /is up · turn 1/i.test(document.body.innerText), null, { timeout: 25000 })

    // Turn one belongs to the host, so skip to Alice's turn and play it for real.
    await host.getByRole('button', { name: 'End turn' }).click()
    await waitForText(host, 'scored')
    await host.getByRole('button', { name: /Next up/i }).click()

    await alice.waitForFunction(
      () => Boolean(document.querySelector('button[aria-label="Correct"]')),
      null,
      { timeout: 30000 },
    )
    await bob.waitForFunction(() => /give clues to alice/i.test(document.body.innerText), null, {
      timeout: 30000,
    })
    log('the guesser and the clue-giver both received the turn')

    const aliceWord = await alice.evaluate(() => {
      const el = document.querySelector('.pointer-events-none p')
      return el ? el.textContent.trim() : null
    })
    const bobText = await bob.evaluate(() => document.body.innerText)
    assert(aliceWord && bobText.includes(aliceWord), `both devices show "${aliceWord}"`)
    log(`both devices agree on the word: ${aliceWord}`)

    await alice.getByRole('button', { name: 'Correct' }).click()
    await alice.getByRole('button', { name: 'Correct' }).click()
    await alice.waitForFunction(() => /2 correct/i.test(document.body.innerText), null, { timeout: 8000 })

    await host.getByRole('button', { name: 'End turn' }).click()
    await waitForText(host, 'Alice scored 2')
    await waitForText(bob, 'Alice scored 2')
    log('the score reached every device through Postgres')

    const finished = await fetchRoom(code)
    const aliceId = finished.headsUp.order[1]
    assert(
      finished.players.find((p) => p.id === aliceId)?.score === 2,
      'the score is persisted server-side, not just on screen',
    )
    log('✓ Heads Up works live')
  } finally {
    for (const device of devices) await device.context.close().catch(() => {})
  }
}

async function spaceteam(browser) {
  log('--- Spaceteam, three devices, live ---')
  const devices = await Promise.all([
    makeDevice(browser, 'host'),
    makeDevice(browser, 'alice'),
    makeDevice(browser, 'bob'),
  ])
  const [host, alice, bob] = devices.map((d) => d.page)

  try {
    await host.goto(`${BASE}/admin`)
    await waitForText(host, 'Host setup')
    await host.getByRole('button', { name: /Spaceteam/i }).first().click()
    await host.getByRole('button', { name: 'Generate Room' }).click()
    await waitForText(host, 'Room Code')

    const code = await host.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem('nix-games-rooms')))[0],
    )
    createdRooms.push(code)

    for (const [page, name] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
    ]) {
      await page.goto(`${BASE}/?code=${code}`)
      await waitForText(page, 'Join a lobby')
      await page.fill('input[placeholder="Your name"]', name)
      await page.getByRole('button', { name: 'Join Room' }).click()
      await waitForText(page, 'Lobby status')
    }
    await host.waitForFunction(
      (n) => n.every((name) => document.body.innerText.includes(name)),
      ['Alice', 'Bob'],
      { timeout: 25000 },
    )

    await host.getByRole('button', { name: /Launch/i }).click()
    await waitForText(host, 'shout this')
    await waitForText(alice, 'shout this')
    await waitForText(bob, 'shout this')
    log('all three devices received a panel and an instruction')

    const live = await fetchRoom(code)
    const ship = live.spaceteam
    assert(Object.keys(ship.panels).length === 3, 'three panels persisted')
    assert(ship.hull === 100, 'full hull in the database')

    const names = Object.fromEntries(live.players.map((p) => [p.id, p.name]))
    const pageFor = { [live.players[0].id]: host }
    for (const player of live.players) {
      if (player.name === 'Alice') pageFor[player.id] = alice
      if (player.name === 'Bob') pageFor[player.id] = bob
    }

    // Carry out one instruction from whichever phone actually owns the control.
    const instruction = Object.values(ship.instructions).find((i) => i.readerId !== i.ownerId)
    assert(instruction, 'at least one instruction is for another player')
    const control = ship.panels[instruction.ownerId].find((c) => c.id === instruction.controlId)
    const label =
      control.type === 'button'
        ? `${control.name} press`
        : control.type === 'toggle'
          ? `${control.name} toggle`
          : `${control.name} ${instruction.targetValue}`

    log(`${names[instruction.readerId]} reads "${instruction.text}", ${names[instruction.ownerId]} owns it`)
    await pageFor[instruction.ownerId].getByRole('button', { name: label, exact: true }).click()

    // The host tick has to see it, score it, and broadcast the result.
    let cleared = 0
    for (let attempt = 0; attempt < 12 && cleared === 0; attempt++) {
      await host.waitForTimeout(700)
      const current = await fetchRoom(code)
      cleared = current.spaceteam?.completed ?? 0
    }
    assert(cleared > 0, 'the press was scored by the host and stored')
    log('✓ a control pressed on one phone cleared an instruction held on another')
  } finally {
    for (const device of devices) await device.context.close().catch(() => {})
  }
}

async function main() {
  log(`target: ${BASE}`)
  const browser = await chromium.launch({ headless: true })
  try {
    await headsUp(browser)
    await spaceteam(browser)
    log(`\n✅ live multiplayer passed. Test rooms created: ${createdRooms.join(', ')}`)
  } finally {
    await browser.close().catch(() => {})
  }
}

main().catch((err) => {
  console.error('\n❌', err.message)
  console.error(`rooms created before the failure: ${createdRooms.join(', ') || 'none'}`)
  process.exit(1)
})
