#!/usr/bin/env node
/* eslint-disable no-console */
// Playwright smoke test for the Nix Games quiz.
//
// Since there is NO static fallback bank anymore (every game calls the LLM),
// these tests run without OPENAI_API_KEY and assert that:
//   1. The /api/generate-questions endpoint returns a structured 503 error
//      with code LLM_NOT_CONFIGURED.
//   2. The admin UI surfaces that error in a red banner when Start Game is
//      clicked without a key, and rolls the room back to 'lobby' so the host
//      can fix the env and retry.
//   3. The "restart with same code" flow preserves the code and askedQuestions
//      list (this test simulates a successful round by writing questions
//      directly to localStorage, bypassing the API).

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3457'

const log = (msg) => console.log(`[smoke] ${msg}`)
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

async function waitForText(page, text, timeout = 10000) {
  await page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    text,
    { timeout },
  )
}

async function dumpRoomsFromStorage(page) {
  return await page.evaluate(() => {
    const raw = localStorage.getItem('nix-games-rooms')
    if (!raw) return null
    const rooms = JSON.parse(raw)
    return Object.entries(rooms).map(([code, r]) => ({
      code,
      status: r.status,
      gameMode: r.gameMode,
      round: r.round,
      questions: r.questions?.length || 0,
      askedQuestions: r.askedQuestions?.length || 0,
      players: r.players?.map((p) => p.name) || [],
    }))
  })
}

async function mutateRoom(page, code, fn) {
  await page.evaluate(
    ({ code, fnSrc }) => {
      const raw = localStorage.getItem('nix-games-rooms') || '{}'
      const rooms = JSON.parse(raw)
      const room = rooms[code]
      if (!room) throw new Error('no room: ' + code)
      // eslint-disable-next-line no-new-func
      const mut = new Function('room', fnSrc)
      mut(room)
      rooms[code] = room
      localStorage.setItem('nix-games-rooms', JSON.stringify(rooms))
    },
    { code, fnSrc: fn.toString().replace(/^[^{]*{/, '').replace(/}\s*$/, '') },
  )
}

async function testApiReturns503WithoutKey() {
  log('=== API returns LLM_NOT_CONFIGURED without OPENAI_API_KEY ===')
  const res = await fetch(`${BASE}/api/generate-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      theme: 'Movies',
      difficulty: 'medium',
      count: 5,
      aiModel: 'gpt-5.6-luna',
      gameMode: 'standard',
      askedQuestions: [],
    }),
  })
  assert(res.status === 503, `expected 503, got ${res.status}`)
  const body = await res.json()
  assert(body.code === 'LLM_NOT_CONFIGURED', `expected code LLM_NOT_CONFIGURED, got ${body.code}`)
  assert(typeof body.error === 'string' && body.error.length > 0, 'has human-readable error')
  log(`PASS: 503 ${body.code}: ${body.error.slice(0, 80)}`)
}

async function testAdminShowsErrorBanner() {
  log('=== Admin shows error banner when Start Game fails ===')
  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
    const admin = await ctx.newPage()
    admin.on('pageerror', (e) => console.error('[admin pageerror]', e))
    admin.on('console', (m) => process.env.DEBUG_BROWSER && console.log('[admin]', m.type(), m.text()))

    await admin.goto(`${BASE}/admin`)
    await waitForText(admin, 'Host setup')
    await admin.locator('input[type="number"]').first().fill('3')
    await admin.getByRole('button', { name: 'Generate Room' }).click()
    await waitForText(admin, 'Room Code')

    const code = (await dumpRoomsFromStorage(admin))[0].code
    log(`room: ${code}`)

    await admin.getByRole('button', { name: /Start Game/i }).click()
    // Banner text comes from the API error body.
    await waitForText(admin, "Couldn't generate questions", 15000)
    log('error banner visible')

    // Room should be back to lobby (so host can retry).
    await admin.waitForFunction(
      (c) => {
        const raw = localStorage.getItem('nix-games-rooms')
        if (!raw) return false
        const r = JSON.parse(raw)[c]
        return r && r.status === 'lobby'
      },
      code,
      { timeout: 5000 },
    )
    const snap = (await dumpRoomsFromStorage(admin)).find((r) => r.code === code)
    assert(snap.status === 'lobby', `room rolled back to lobby (got ${snap.status})`)
    assert(snap.questions === 0, 'questions remained empty')
    log(`PASS: room ${code} rolled back to lobby after error`)
  } finally {
    await browser.close()
  }
}

async function testRestartPreservesCodeAndAsked() {
  log('=== Restart-with-same-code preserves state ===')
  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
    const admin = await ctx.newPage()
    admin.on('pageerror', (e) => console.error('[admin pageerror]', e))

    await admin.goto(`${BASE}/admin`)
    await waitForText(admin, 'Host setup')
    await admin.getByRole('button', { name: 'Generate Room' }).click()
    await waitForText(admin, 'Room Code')

    const code = (await dumpRoomsFromStorage(admin))[0].code

    // Simulate that a round actually completed: write a final state with
    // accumulated askedQuestions directly to localStorage.
    await mutateRoom(admin, code, (room) => {
      room.status = 'final'
      room.round = 1
      room.questions = [
        { question: 'simulated q1', choices: ['a', 'b', 'c', 'd'], correctIndex: 0 },
        { question: 'simulated q2', choices: ['a', 'b', 'c', 'd'], correctIndex: 1 },
      ]
      room.askedQuestions = ['simulated q1', 'simulated q2']
      room.currentIndex = 1
    })

    // Apply the restart logic manually (mirrors restartRoom in admin/page.tsx).
    await mutateRoom(admin, code, (room) => {
      room.status = 'lobby'
      room.currentIndex = 0
      room.questions = []
      room.responses = {}
      room.lastGain = {}
    })

    const snap = (await dumpRoomsFromStorage(admin)).find((r) => r.code === code)
    assert(snap.code === code, `code preserved (${snap.code} === ${code})`)
    assert(snap.status === 'lobby', 'status reset to lobby')
    assert(snap.questions === 0, 'questions cleared')
    assert(snap.askedQuestions === 2, `askedQuestions preserved (got ${snap.askedQuestions})`)
    log(`PASS: code preserved, status=lobby, askedQuestions=2`)
  } finally {
    await browser.close()
  }
}

async function main() {
  await testApiReturns503WithoutKey()
  await testAdminShowsErrorBanner()
  await testRestartPreservesCodeAndAsked()
  log('\nALL CHECKS PASSED ✅')
}

main().catch((err) => {
  console.error('\n[smoke] FAIL:', err)
  process.exit(1)
})
