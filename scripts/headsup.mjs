#!/usr/bin/env node
/* eslint-disable no-console */
// Heads Up! end-to-end smoke test.
//
// What it does:
//   * Spawns ONE Chromium browser with THREE independent contexts (host +
//     2 players) so each has its own localStorage, acting as separate devices.
//   * Intercepts /api/rooms/[code] and serves from a shared in-process Map, the
//     same trick scripts/multiplayer.mjs uses, so no database is needed.
//     /api/rooms-stream/* is forced to 500 so clients use the polling path.
//   * Uses a built-in deck, so no OPENAI_API_KEY is needed either.
//
// What it asserts:
//   * Host creates a Heads Up room with a built-in deck and a 30s round.
//   * Two players join and the host sees them.
//   * Starting the game puts player 1 on the clock: their device shows the
//     forehead card, the other devices show the same word plus "give clues".
//   * Headless Chromium reports the orientation API but never fires a reading,
//     so the card falls back to taps, which is exactly the desktop path.
//   * The turn summary lists what was guessed and what was passed, and the
//     score equals the number of correct cards.
//   * Advancing runs the second player's turn, then the final leaderboard.

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ROUND_SECONDS = 30

const log = (msg) => console.log(`[headsup] ${msg}`)
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

const roomStore = new Map()

async function installRoutes(page) {
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
      const body = JSON.parse(req.postData() || '{}')
      roomStore.set(code, { ...body, code })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
      return
    }
    await route.continue()
  })

  await page.route(/\/api\/rooms-stream\/[^/?]+/, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'sse-disabled-in-test' }),
    })
  })
}

const waitForText = (page, text, timeout = 15000) =>
  page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    text,
    { timeout },
  )

const getRoomCode = (host) =>
  host.evaluate(() => {
    const raw = localStorage.getItem('nix-games-rooms')
    if (!raw) return null
    return Object.keys(JSON.parse(raw))[0] || null
  })

const room = (code) => roomStore.get(code)

/** Taps the forehead card: the bottom half is correct, the top half is a pass. */
async function tapCard(page, kind) {
  // The card always exposes both halves as buttons, whatever the labels say,
  // so this works with or without a tilt sensor.
  await page.getByRole('button', { name: kind === 'got' ? 'Correct' : 'Pass' }).click()
}

/** The forehead card is up once both of its halves exist. */
const waitForCard = (page, timeout = 20000) =>
  page.waitForFunction(
    () =>
      Boolean(
        document.querySelector('button[aria-label="Correct"]') &&
          document.querySelector('button[aria-label="Pass"]'),
      ),
    null,
    { timeout },
  )

async function main() {
  log('launching chromium...')
  const browser = await chromium.launch({ headless: true })
  const contexts = []
  const pages = []

  try {
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { width: 420, height: 820 },
      })
      const page = await ctx.newPage()
      const who = i === 0 ? 'host' : `p${i}`
      page.on('pageerror', (e) => console.error(`[${who} pageerror]`, e.message))
      if (process.env.DEBUG_BROWSER) {
        page.on('console', (m) => console.log(`[${who}]`, m.type(), m.text()))
      }
      await installRoutes(page)
      contexts.push(ctx)
      pages.push(page)
    }

    const host = pages[0]
    const players = pages.slice(1)
    const names = ['Alice', 'Bob']

    // ----- HOST: create a Heads Up room -----
    log('host: opening /admin')
    await host.goto(`${BASE}/admin`)
    await waitForText(host, 'Host setup')

    await host.getByRole('button', { name: /Heads Up/i }).first().click()
    await waitForText(host, 'Deck')
    await host.getByRole('button', { name: /Animals/i }).first().click()
    await host.getByRole('button', { name: `${ROUND_SECONDS}s`, exact: true }).click()
    await host.getByRole('button', { name: 'Generate Room' }).click()
    await waitForText(host, 'Room Code')

    const code = await getRoomCode(host)
    assert(code, 'host created a room code')
    assert(room(code).gameMode === 'headsup', 'room is in headsup mode')
    assert(room(code).headsUp?.roundSeconds === ROUND_SECONDS, 'round length persisted')
    log(`room ${code} created, deck "${room(code).headsUp.deckName}"`)

    // ----- PLAYERS: join -----
    for (let i = 0; i < players.length; i++) {
      await players[i].goto(`${BASE}/?code=${code}`)
      await waitForText(players[i], 'Join a lobby')
      await players[i].fill('input[placeholder="Your name"]', names[i])
      await players[i].getByRole('button', { name: 'Join Room' }).click()
      await waitForText(players[i], 'Lobby status', 10000)
      log(`${names[i]} joined`)
    }

    await host.waitForFunction(
      (n) => n.every((name) => document.body.innerText.includes(name)),
      names,
      { timeout: 15000 },
    )
    log('host sees both players')

    // ----- HOST: start -----
    await host.getByRole('button', { name: /Start Heads Up/i }).click()
    await host.waitForFunction(() => /is up · turn 1 \/ 3/i.test(document.body.innerText), null, {
      timeout: 15000,
    })

    const state = room(code).headsUp
    assert(state.words.length > 10, `deck loaded (${state.words.length} words)`)
    assert(state.order.length === 3, 'turn order covers host + 2 players')
    log(`turn 1 live: ${room(code).players.find((p) => p.id === state.order[0]).name} guessing`)

    // The host created the room first, so the host is guesser #1.
    // Turn 2 belongs to Alice, which is the turn we drive from a player device.
    log('host: skipping turn 1 (host device is the guesser)')
    await host.getByRole('button', { name: 'End turn' }).click()
    await waitForText(host, 'scored', 10000)
    await host.getByRole('button', { name: /Next up|Finish/i }).click()

    // ----- TURN 2: Alice guesses, everyone else gives clues -----
    const alice = players[0]
    const bob = players[1]

    await waitForCard(alice)
    log('alice: forehead card is up')

    await bob.waitForFunction(() => /give clues to alice/i.test(document.body.innerText), null, {
      timeout: 20000,
    })
    log('bob: sees the clue-giver screen')

    const aliceWord = await alice.evaluate(() => {
      const el = document.querySelector('.pointer-events-none p')
      return el ? el.textContent.trim() : null
    })
    const bobWord = await bob.evaluate(() => {
      const match = document.body.innerText.match(/Give clues to Alice\s*\n+([^\n]+)/i)
      return match ? match[1].trim() : null
    })
    assert(aliceWord, 'alice sees a word')
    assert(bobWord === aliceWord, `clue-giver sees the same word (${bobWord} vs ${aliceWord})`)
    log(`both devices show "${aliceWord}"`)

    await tapCard(alice, 'got')
    await tapCard(alice, 'got')
    await tapCard(alice, 'pass')

    await alice.waitForFunction(() => /2 correct/i.test(document.body.innerText), null, {
      timeout: 5000,
    })
    log('alice: 2 correct, 1 passed')

    const aliceId = room(code).headsUp.order[1]
    const cards = room(code).headsUp.results[aliceId] || []
    assert(cards.length === 3, `three cards recorded, got ${cards.length}`)
    assert(cards.filter((c) => c.got).length === 2, 'two of them correct')

    // ----- End the turn and check the summary -----
    await host.getByRole('button', { name: 'End turn' }).click()
    await waitForText(host, 'Alice scored 2', 10000)
    await waitForText(alice, 'Alice scored 2', 10000)
    log('turn summary agrees on both devices')

    const scored = room(code).players.find((p) => p.id === aliceId)
    assert(scored.score === 2, `alice banked 2 points, got ${scored.score}`)

    // ----- Final turn, then the leaderboard -----
    await host.getByRole('button', { name: /Next up/i }).click()
    await waitForCard(bob)
    await tapCard(bob, 'got')
    await host.getByRole('button', { name: 'End turn' }).click()
    await waitForText(host, 'Bob scored 1', 10000)

    await host.getByRole('button', { name: /Finish/i }).click()
    await waitForText(host, 'Final leaderboard', 10000)
    await waitForText(alice, 'Final leaderboard', 10000)

    const final = room(code)
    assert(final.status === 'final', 'room reached final')
    const byName = Object.fromEntries(final.players.map((p) => [p.name, p.score]))
    assert(byName.Alice === 2, `Alice finished on 2, got ${byName.Alice}`)
    assert(byName.Bob === 1, `Bob finished on 1, got ${byName.Bob}`)
    log(`final scores: ${JSON.stringify(byName)}`)

    log('\n✅ all Heads Up assertions passed')
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch((err) => {
  console.error('\n❌', err.message)
  process.exit(1)
})
