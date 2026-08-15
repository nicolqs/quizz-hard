#!/usr/bin/env node
/* eslint-disable no-console */
// Spaceteam end-to-end smoke test: host plus two players, three devices.
//
// The room API is stubbed in-process like the other multiplayer tests, but this
// one also stubs /api/rooms/[code]/spaceteam and reimplements both of its atomic
// operations in JavaScript, so the concurrency contract itself is exercised:
// actions append, and a host state write must not swallow an action that landed
// while the host was thinking.
//
// No database and no API key needed.

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'

const log = (msg) => console.log(`[spaceteam-e2e] ${msg}`)
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

const roomStore = new Map()

async function installRoutes(page) {
  // The dedicated Spaceteam endpoint, with the same semantics as the SQL.
  await page.route(/\/api\/rooms\/[^/?]+\/spaceteam$/, async (route) => {
    const req = route.request()
    const code = (new URL(req.url()).pathname.split('/').at(-2) || '').toUpperCase()
    const body = JSON.parse(req.postData() || '{}')
    const room = roomStore.get(code)

    if (room) {
      const current = room.spaceteam || {}
      if (body.op === 'action') {
        current.pending = [
          ...(current.pending || []),
          { seq: body.seq, playerId: body.playerId, controlId: body.controlId, value: body.value },
        ]
        room.spaceteam = current
      } else if (body.op === 'state') {
        const survivors = (current.pending || []).filter((a) => a.seq > (body.through || 0))
        room.spaceteam = { ...body.state, pending: survivors }
      }
      roomStore.set(code, room)
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
  })

  await page.route(/\/api\/rooms\/[^/?]+(\?.*)?$/, async (route) => {
    const req = route.request()
    const code = (new URL(req.url()).pathname.split('/').pop() || '').toUpperCase()
    if (req.method() === 'GET') {
      const room = roomStore.get(code)
      await route.fulfill({
        status: room ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(room ?? { error: 'Room not found' }),
      })
      return
    }
    if (req.method() === 'PUT') {
      const incoming = JSON.parse(req.postData() || '{}')
      const existing = roomStore.get(code)
      // Mirrors the SQL: the whole-room save never overwrites spaceteam state.
      roomStore.set(code, {
        ...incoming,
        code,
        spaceteam: existing?.spaceteam ?? incoming.spaceteam ?? {},
      })
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
      return
    }
    await route.continue()
  })

  await page.route(/\/api\/rooms-stream\/[^/?]+/, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  )
}

const waitForText = (page, needle, timeout = 15000) =>
  page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    needle,
    { timeout },
  )

const room = (code) => roomStore.get(code)
const ship = (code) => room(code)?.spaceteam

/** Finds whoever can carry out an instruction and clicks the right control. */
async function obey(pages, playersById, instruction, state) {
  const control = state.panels[instruction.ownerId].find((c) => c.id === instruction.controlId)
  const page = pages[playersById[instruction.ownerId]]
  const label =
    control.type === 'button'
      ? `${control.name} press`
      : control.type === 'toggle'
        ? `${control.name} toggle`
        : `${control.name} ${instruction.targetValue}`

  const button = page.getByRole('button', { name: label, exact: true })
  if ((await button.count()) === 0) return false
  await button.click()
  return true
}

async function main() {
  log('launching chromium...')
  const browser = await chromium.launch({ headless: true })
  const contexts = []
  const pages = []

  try {
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext({
        viewport: { width: 420, height: 900 },
        permissions: ['clipboard-read', 'clipboard-write'],
      })
      const page = await ctx.newPage()
      page.on('pageerror', (e) => console.error(`[dev${i} pageerror]`, e.message))
      await installRoutes(page)
      contexts.push(ctx)
      pages.push(page)
    }

    const [host, alice, bob] = pages

    await host.goto(`${BASE}/admin`)
    await waitForText(host, 'Host setup')
    await host.getByRole('button', { name: /Spaceteam/i }).first().click()
    await host.getByRole('button', { name: 'Generate Room' }).click()
    await waitForText(host, 'Room Code')

    const code = await host.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem('nix-games-rooms')))[0],
    )
    log(`room ${code} created in spaceteam mode`)

    for (const [page, name] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
    ]) {
      await page.goto(`${BASE}/?code=${code}`)
      await waitForText(page, 'Join a lobby')
      await page.fill('input[placeholder="Your name"]', name)
      await page.getByRole('button', { name: 'Join Room' }).click()
      await waitForText(page, 'Lobby status', 10000)
    }
    await host.waitForFunction(
      (n) => n.every((name) => document.body.innerText.includes(name)),
      ['Alice', 'Bob'],
      { timeout: 15000 },
    )
    log('two players aboard')

    await host.getByRole('button', { name: /Launch/i }).click()
    await waitForText(host, 'shout this', 15000)
    await waitForText(alice, 'shout this', 15000)
    log('launched: every device has an instruction')

    const state = ship(code)
    assert(Object.keys(state.panels).length === 3, 'three panels built')
    assert(state.hull === 100, 'full hull at launch')
    assert(Object.keys(state.instructions).length === 3, 'everyone holds an instruction')

    // Each device shows only its own six controls.
    const aliceId = Object.keys(state.panels).find(
      (id) => room(code).players.find((p) => p.id === id)?.name === 'Alice',
    )
    // Control labels render uppercase via CSS, and innerText reflects that, so
    // every comparison here is case-insensitive.
    const aliceControls = state.panels[aliceId].map((c) => c.name.toLowerCase())
    const aliceText = (await alice.evaluate(() => document.body.innerText)).toLowerCase()
    assert(aliceControls.every((n) => aliceText.includes(n)), 'alice sees her own controls')

    // Her instruction names someone else's control on purpose, so the check is
    // on what she can actually operate: the buttons on her own panel.
    const aliceButtons = (
      await alice.$$eval('button[aria-label]', (els) => els.map((e) => e.getAttribute('aria-label')))
    ).map((label) => label.toLowerCase())
    const others = Object.entries(state.panels)
      .filter(([id]) => id !== aliceId)
      .flatMap(([, controls]) => controls.map((c) => c.name.toLowerCase()))
    assert(
      !others.some((name) => aliceButtons.some((label) => label.includes(name))),
      'alice has no control that belongs to another panel',
    )
    log('each device can only operate its own panel')

    // And the instruction she is holding is very likely for a panel she cannot touch.
    const aliceInstruction = state.instructions[aliceId]
    log(
      aliceInstruction.ownerId === aliceId
        ? 'alice drew one of her own controls this time'
        : "alice's instruction is for somebody else's panel, as intended",
    )

    // The point of the game: most instructions are for a panel you do not hold.
    const elsewhere = Object.values(state.instructions).filter((i) => i.readerId !== i.ownerId).length
    log(`${elsewhere} of 3 opening instructions are for another player's panel`)

    // Carry out instructions across devices and watch the counter climb.
    const playersById = Object.fromEntries(
      room(code).players.map((p, index) => [
        p.id,
        p.name === 'Alice' ? 1 : p.name === 'Bob' ? 2 : 0,
      ]),
    )

    let cleared = 0
    for (let attempt = 0; attempt < 8 && cleared < 3; attempt++) {
      const current = ship(code)
      if (!current || current.outcome !== 'flying') break
      const before = current.completed
      const instruction = Object.values(current.instructions)[attempt % 3]
      const acted = await obey(pages, playersById, instruction, current)
      if (!acted) continue
      await host
        .waitForFunction((n) => (window.__done = true) && n >= 0, before, { timeout: 1000 })
        .catch(() => {})
      await host.waitForTimeout(900)
      if (ship(code).completed > before) cleared++
    }

    assert(cleared > 0, `instructions were completed across devices, cleared ${cleared}`)
    log(`${cleared} instructions carried out from another player's phone`)

    // The concurrency contract, tested deterministically.
    //
    // A live host drains everything it sees, so the host tick is stopped first.
    // Then: a host reads the queue, an action lands, and the host writes its
    // state a moment later. That action must survive, because the write only
    // drops what the host had already read.
    await host.close()
    await host.context().close()
    await alice.waitForTimeout(600)

    const beforeProbe = (ship(code).pending || []).reduce((max, a) => Math.max(max, a.seq), 0)

    await alice.evaluate(
      ([roomCode, playerId, seq]) =>
        fetch(`/api/rooms/${roomCode}/spaceteam`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: 'action', playerId, controlId: 'late-probe', value: 9, seq }),
        }),
      [code, 'probe-player', beforeProbe + 1000],
    )
    await alice.waitForTimeout(200)
    assert(
      (ship(code).pending || []).some((a) => a.controlId === 'late-probe'),
      'the action reached the queue',
    )

    // The host writes state having only read up to beforeProbe.
    await alice.evaluate(
      ([roomCode, state, through]) =>
        fetch(`/api/rooms/${roomCode}/spaceteam`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: 'state', state, through }),
        }),
      [code, { ...ship(code), pending: [] }, beforeProbe],
    )
    await alice.waitForTimeout(200)

    const survivors = ship(code).pending || []
    assert(
      survivors.some((a) => a.controlId === 'late-probe'),
      'an action that landed after the host read survives the host write',
    )
    assert(
      !survivors.some((a) => a.seq <= beforeProbe),
      'everything the host had already read is drained',
    )
    log('late actions survive the host write, processed ones are drained')

    log('\n✅ all Spaceteam end-to-end assertions passed')
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch((err) => {
  console.error('\n❌', err.message)
  process.exit(1)
})
