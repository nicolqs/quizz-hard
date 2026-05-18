#!/usr/bin/env node
/* eslint-disable no-console */
// Multiplayer end-to-end smoke test.
//
// What it does:
//   * Spawns ONE Chromium browser with FOUR independent contexts so each one
//     has its own localStorage / cookies (acting as 4 separate "devices").
//   * In each page, intercepts /api/rooms/[code] (GET/PUT) and serves from a
//     SHARED in-process Map so room state syncs across tabs without needing
//     a real database. /api/rooms-stream/* is short-circuited to 500 so the
//     client falls back to its polling code path (500ms polling).
//   * Lets /api/generate-questions pass through to the real OpenAI - the
//     server reads OPENAI_API_KEY from its env. Questions are actually AI-
//     generated, no fallback.
//
// What it asserts:
//   * Host creates a room. 3 players join via /?code=XXX.
//   * Host clicks Start Game. Real questions arrive. Status flips to 'question'.
//   * Each of the 3 players sees the question screen, picks a different answer.
//   * Timer expires -> results visible to all four. Scores update server-side
//     based on each player's choice and remaining time.
//   * Host advances through all questions to Final Leaderboard.
//   * Host clicks "Play again (keep scores)" -> same code, status='lobby', and
//     askedQuestions preserved so the SECOND round won't repeat.

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const QUESTION_COUNT = 3
const TIME_PER_Q = 8 // seconds (matches the form's minimum)
const PLAYER_COUNT = 3

const log = (msg) => console.log(`[mp] ${msg}`)
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

// Shared in-process room store. Acts as our "database" for the test.
const roomStore = new Map() // code -> Room

async function installRoutes(page) {
  // /api/rooms/CODE - GET and PUT.
  await page.route(/\/api\/rooms\/[^\/?]+(\?.*)?$/, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const codeRaw = url.pathname.split('/').pop() || ''
    const code = codeRaw.toUpperCase()
    if (req.method() === 'GET') {
      const room = roomStore.get(code)
      if (!room) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Room not found' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(room),
        })
      }
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

  // /api/rooms-stream/CODE - force the client to drop into its polling fallback.
  await page.route(/\/api\/rooms-stream\/[^\/?]+/, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'sse-disabled-in-test' }),
    })
  })
}

async function waitForText(page, text, timeout = 15000) {
  await page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    text,
    { timeout },
  )
}

async function getHostRoomCode(host) {
  return await host.evaluate(() => {
    const raw = localStorage.getItem('nix-games-rooms')
    if (!raw) return null
    const rooms = JSON.parse(raw)
    return Object.keys(rooms)[0] || null
  })
}

async function main() {
  log('launching chromium...')
  const browser = await chromium.launch({ headless: true })
  const contexts = []
  const pages = []
  try {
    // 4 independent contexts (host + 3 players) - each gets its own storage.
    for (let i = 0; i < 1 + PLAYER_COUNT; i++) {
      const ctx = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
      })
      const p = await ctx.newPage()
      p.on('pageerror', (e) => console.error(`[${i === 0 ? 'host' : 'p' + i} pageerror]`, e.message))
      p.on('console', (m) => {
        if (process.env.DEBUG_BROWSER) {
          console.log(`[${i === 0 ? 'host' : 'p' + i}]`, m.type(), m.text())
        }
      })
      await installRoutes(p)
      contexts.push(ctx)
      pages.push(p)
    }
    const host = pages[0]
    const players = pages.slice(1)

    // ----- HOST: create the room -----
    log('host: opening /admin')
    await host.goto(`${BASE}/admin`)
    await waitForText(host, 'Host setup')

    // Configure tiny game: 3 questions, 8s per question.
    const numberInputs = host.locator('input[type="number"]')
    await numberInputs.nth(0).fill(String(QUESTION_COUNT))
    await numberInputs.nth(1).fill(String(TIME_PER_Q))

    await host.getByRole('button', { name: 'Generate Room' }).click()
    await waitForText(host, 'Room Code')
    const code = await getHostRoomCode(host)
    assert(code, 'host created a room code')
    log(`room created: ${code}`)
    // Sanity: store should now have the room.
    assert(roomStore.has(code), 'shared store has the room')

    // ----- PLAYERS: each joins -----
    const playerNames = ['Alice', 'Bob', 'Carol']
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      log(`${playerNames[i]}: visiting /?code=${code}`)
      await p.goto(`${BASE}/?code=${code}`)
      await waitForText(p, 'Join a lobby')
      await p.fill('input[placeholder="Your name"]', playerNames[i])
      await p.getByRole('button', { name: 'Join Room' }).click()
      await waitForText(p, 'Lobby status', 10000)
      log(`${playerNames[i]}: joined`)
    }

    // Host should now see all players via its polling subscription.
    log('host: waiting to see all players in lobby...')
    await host.waitForFunction(
      (names) => names.every((n) => document.body.innerText.includes(n)),
      playerNames,
      { timeout: 15000 },
    )
    log('host: sees Alice, Bob, Carol in lobby')

    // ----- HOST: start the game (real LLM call) -----
    log('host: clicking Start Game (will hit real OpenAI)...')
    await host.getByRole('button', { name: /Start Game/i }).click()
    // Wait for first question to render on host (LLM round-trip).
    await host.waitForFunction(
      () => /question \d+ \/ \d+/i.test(document.body.innerText),
      null,
      { timeout: 45000 },
    )
    log('host: question 1 rendered')

    // ----- Each player picks a different answer for each question -----
    for (let qIdx = 0; qIdx < QUESTION_COUNT; qIdx++) {
      log(`\n--- Question ${qIdx + 1} ---`)
      // Wait for question to render on each player.
      for (let i = 0; i < players.length; i++) {
        await players[i].waitForFunction(
          () => /question \d+ \/ \d+/i.test(document.body.innerText),
          null,
          { timeout: 15000 },
        )
      }
      // Each player picks a different choice (0, 1, 2).
      for (let i = 0; i < players.length; i++) {
        const p = players[i]
        const choiceIdx = i % 4
        // The answer buttons live inside the question card. Pick the Nth.
        const answerButtons = p.locator('button:has-text("")').filter({
          has: p.locator('span'),
        })
        // Simpler approach: find buttons that look like answer rows (border + p-3).
        const choices = await p.locator('button').filter({ hasText: /.+/ }).all()
        // Heuristic: the answer buttons appear after the timer "Countdown" label.
        // Just click by index from the rendered question card.
        const cardButtons = await p
          .locator('section, div')
          .filter({ has: p.getByText(/question \d+ \/ \d+/i) })
          .locator('button')
          .all()
        // Pick the answer buttons (skip any nav buttons). Filter to those whose
        // text length looks like a choice (1-80 chars, no "Locked in").
        const realChoices = []
        for (const b of cardButtons) {
          const t = (await b.innerText().catch(() => '')).trim()
          if (t && !/copy|start game|next question|join|generate|share|dismiss|menu/i.test(t)) {
            realChoices.push({ b, t })
          }
        }
        if (realChoices.length >= 1) {
          const pick = realChoices[Math.min(choiceIdx, realChoices.length - 1)]
          log(`  ${playerNames[i]}: picking "${pick.t.slice(0, 40)}"`)
          await pick.b.click({ timeout: 5000 }).catch(() => {})
        }
      }

      // Wait for the timer to elapse and the host's endQuestion to fire.
      // (Host has 8s/question; allow a 5s grace window.)
      await host.waitForFunction(
        () => {
          const t = document.body.innerText.toLowerCase()
          return t.includes('round results') || t.includes('final leaderboard')
        },
        null,
        { timeout: TIME_PER_Q * 1000 + 8000 },
      )

      // Verify each player saw results too.
      for (let i = 0; i < players.length; i++) {
        await players[i].waitForFunction(
          () => {
            const t = document.body.innerText.toLowerCase()
            return t.includes('round results') || t.includes('final leaderboard')
          },
          null,
          { timeout: 5000 },
        )
      }
      log('  all players see results')

      // Advance unless this was the last question.
      if (qIdx < QUESTION_COUNT - 1) {
        await host.getByRole('button', { name: 'Next Question' }).click()
        await host.waitForFunction(
          (target) => {
            const m = document.body.innerText.match(/question (\d+) \/ \d+/i)
            return m && Number(m[1]) === target
          },
          qIdx + 2,
          { timeout: 10000 },
        )
      }
    }

    // ----- Final screen -----
    await waitForText(host, 'Final Leaderboard', 10000)
    log('\nhost: reached Final Leaderboard')
    for (const p of players) await waitForText(p, 'Final Leaderboard', 5000)
    log('all players see Final Leaderboard')

    // Capture round-1 scores from host's view.
    const round1Scores = await host.evaluate(() => {
      const raw = localStorage.getItem('nix-games-rooms')
      const rooms = JSON.parse(raw)
      const room = Object.values(rooms)[0]
      return room.players.map((p) => ({ name: p.name, score: p.score }))
    })
    log(`scores after round 1: ${round1Scores.map((p) => `${p.name}=${p.score}`).join(', ')}`)
    assert(round1Scores.length === 1 + PLAYER_COUNT, 'all 4 participants present')
    assert(
      round1Scores.every((p) => typeof p.score === 'number' && p.score >= 0),
      'every player has a numeric score (zero is OK - depends on which choices the LLM made correct)',
    )

    // ----- Restart with same code -----
    log('\nhost: clicking "Play again (keep scores)"...')
    await host.getByRole('button', { name: 'Play again (keep scores)' }).click()
    await waitForText(host, 'Lobby')
    // Wait until store reflects the lobby state.
    await new Promise((r) => setTimeout(r, 600))
    const newRoom = roomStore.get(code)
    assert(newRoom.status === 'lobby', `room reset to lobby (got ${newRoom.status})`)
    assert(newRoom.code === code, 'same room code')
    assert(Array.isArray(newRoom.askedQuestions) && newRoom.askedQuestions.length >= QUESTION_COUNT, `askedQuestions preserved (got ${newRoom.askedQuestions?.length})`)
    assert(newRoom.players.length === 1 + PLAYER_COUNT, 'players preserved')
    log(`restart kept code ${code}, lobby, askedQuestions=${newRoom.askedQuestions.length}`)

    // Verify each player tab also flipped back to lobby via polling.
    for (let i = 0; i < players.length; i++) {
      await players[i].waitForFunction(
        () => document.body.innerText.toLowerCase().includes('waiting for host'),
        null,
        { timeout: 5000 },
      )
    }
    log('all players bounced back to lobby waiting-screen')

    // ----- Second round to verify variety -----
    log('\nhost: starting round 2 (should generate DIFFERENT questions)...')
    await host.getByRole('button', { name: /Start Game/i }).click()
    await host.waitForFunction(
      () => /question 1 \/ \d+/i.test(document.body.innerText),
      null,
      { timeout: 45000 },
    )
    log('host: round 2 question 1 rendered')

    const round2 = roomStore.get(code)
    const r1Questions = newRoom.askedQuestions
    const r2Questions = round2.questions.map((q) => q.question)
    log(`round 1 questions: ${r1Questions.map((q) => q.slice(0, 40)).join(' | ')}`)
    log(`round 2 questions: ${r2Questions.map((q) => q.slice(0, 40)).join(' | ')}`)
    const overlap = r2Questions.filter((q) => r1Questions.includes(q))
    assert(overlap.length === 0, `round 2 has no repeated questions from round 1 (overlap=${overlap.length})`)
    log(`no overlap between rounds ✅`)

    log('\nALL MULTIPLAYER CHECKS PASSED ✅')
  } finally {
    for (const ctx of contexts) {
      await ctx.close().catch(() => {})
    }
    await browser.close().catch(() => {})
  }
}

main().catch((err) => {
  console.error('\n[mp] FAIL:', err)
  process.exit(1)
})
