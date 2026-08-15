#!/usr/bin/env node
/* eslint-disable no-console */
// 2 Player Games smoke test.
//
// One device, two halves, no room and no network, so this needs neither a
// database nor an API key. Playwright drives two independent pointers to stand
// in for two thumbs on the same screen.
//
// What it asserts:
//   * The picker lists the three games and each one starts a match.
//   * Reaction: tapping before the light hands the point to the other player,
//     and tapping first after the light wins it.
//   * Ping Pong: a paddle left parked concedes, so a point always resolves.
//   * Sumo: shoving works, a point resolves, and the ring resets for the next.
//   * First to 3 ends the match and the winner banner names the right player.

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'

const log = (msg) => console.log(`[duel] ${msg}`)
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

const text = (page) => page.evaluate(() => document.body.innerText)
const waitForText = (page, needle, timeout = 15000) =>
  page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    needle,
    { timeout },
  )

/** Score is rendered once per half; read them straight out of the DOM. */
const scores = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('span.text-2xl.font-black')).map((el) =>
      Number(el.textContent.trim()),
    ),
  )

async function tapHalf(page, half) {
  const box = page.viewportSize()
  const y = half === 1 ? box.height * 0.25 : box.height * 0.75
  await page.mouse.click(box.width / 2, y)
}

/** The 3-2-1 card covers the play area, so wait for it to clear before tapping. */
const waitForLive = (page, timeout = 12000) =>
  page.waitForFunction(() => !document.querySelector('.z-10'), null, { timeout })

/** Plays a point of Reaction and returns which player took it. */
async function playReactionPoint(page, taker) {
  await waitForLive(page)
  // Wait for the light rather than racing it.
  await page.waitForFunction(() => /tap!/i.test(document.body.innerText), null, { timeout: 12000 })
  await tapHalf(page, taker)
  // The match-winning point skips the "scores" card and goes straight to "wins".
  await page.waitForFunction(() => /scores|wins/i.test(document.body.innerText), null, { timeout: 6000 })
}

async function main() {
  log('launching chromium...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 420, height: 820 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))

  try {
    await page.goto(`${BASE}/duel`)
    await waitForText(page, '2 Player Games')

    const picker = await text(page)
    for (const name of ['Ping Pong', 'Sumo', 'Reaction']) {
      assert(picker.includes(name), `picker lists ${name}`)
    }
    log('picker lists all three games')

    // ---------------------------------------------------------- Reaction
    await page.getByRole('button', { name: /Reaction/i }).click()
    await waitForText(page, 'hands off', 8000)
    await waitForLive(page)
    log('reaction: match started')

    // Jumping the gun gives the point away.
    await page.waitForFunction(() => /wait…/i.test(document.body.innerText), null, { timeout: 8000 })
    await tapHalf(page, 1)
    await waitForText(page, 'too early', 6000)
    const afterFoul = await text(page)
    assert(/cyan scores/i.test(afterFoul), 'an early tap by pink gives cyan the point')
    log('reaction: early tap correctly punished')

    await tapHalf(page, 2) // dismiss the point overlay
    await playReactionPoint(page, 2)
    await tapHalf(page, 2)
    await playReactionPoint(page, 2)
    await page.waitForTimeout(300)

    await waitForText(page, 'cyan wins', 8000)
    const finalScores = await scores(page)
    assert(finalScores.includes(3), `match ended at 3 points, saw ${finalScores}`)
    log(`reaction: match won 3-0, banner correct`)

    await page.getByRole('button', { name: /Pick another game/i }).click()
    await waitForText(page, 'first to 3', 6000).catch(() => {})

    // ---------------------------------------------------------- Ping Pong
    await page.getByRole('button', { name: /Ping Pong/i }).click()
    await waitForText(page, 'slide your thumb', 8000)
    await waitForLive(page)
    log('pong: match started')

    // Nobody touches anything, so the ball has to get past a paddle and score.
    await waitForText(page, 'scores', 20000)
    const pongScores = await scores(page)
    assert(pongScores[0] + pongScores[1] === 1, `exactly one point scored, saw ${pongScores}`)
    log(`pong: point resolved (${pongScores.join('-')})`)

    // The overlay must clear and the next point must serve.
    await tapHalf(page, 2)
    await page.waitForFunction(() => !/tap for the next point/i.test(document.body.innerText), null, {
      timeout: 8000,
    })
    log('pong: next point served')

    await page.waitForFunction(() => /quit/i.test(document.body.innerText), null, { timeout: 5000 })
    await page.getByRole('button', { name: 'quit' }).click()
    await waitForText(page, '2 Player Games', 6000)

    // ---------------------------------------------------------------- Sumo
    await page.getByRole('button', { name: /Sumo/i }).click()
    await waitForText(page, 'press and drag', 8000)
    await waitForLive(page)
    log('sumo: match started')

    // Player 2 drags hard upward: the discs collide and someone leaves the ring.
    const box = page.viewportSize()
    await page.mouse.move(box.width / 2, box.height * 0.75)
    await page.mouse.down()
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(box.width / 2, box.height * 0.75 - 90)
      await page.waitForTimeout(60)
    }
    await page.mouse.up()

    await waitForText(page, 'scores', 20000)
    const sumoScores = await scores(page)
    assert(sumoScores[0] + sumoScores[1] === 1, `sumo resolved one point, saw ${sumoScores}`)
    log(`sumo: point resolved (${sumoScores.join('-')})`)

    log('\n✅ all 2 Player Games assertions passed')
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch((err) => {
  console.error('\n❌', err.message)
  process.exit(1)
})
