'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useCanvasSize, useGameLoop } from '@/hooks/useGameLoop'
import { playerColor, type DuelPlayer } from '@/lib/duel'

// Classic rally. The court is the whole screen: player 1 defends the top edge,
// player 2 the bottom. Miss and the other player takes the point.

const PADDLE_WIDTH = 92
const PADDLE_HEIGHT = 12
const PADDLE_INSET = 34
const BALL_RADIUS = 9
const START_SPEED = 330
const SPEED_GAIN = 1.045 // per paddle hit
const MAX_SPEED = 900

type State = {
  w: number
  h: number
  ball: { x: number; y: number; vx: number; vy: number }
  paddleX: { 1: number; 2: number }
  live: boolean
}

export function PingPong({ onPoint, running }: { onPoint: (winner: DuelPlayer) => void; running: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useRef<State>({
    w: 0,
    h: 0,
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    paddleX: { 1: 0, 2: 0 },
    live: false,
  })
  const scored = useRef(false)

  const serve = useCallback((towards: DuelPlayer) => {
    const s = state.current
    const angle = (Math.random() * 0.6 - 0.3) + (towards === 1 ? -Math.PI / 2 : Math.PI / 2)
    s.ball = {
      x: s.w / 2,
      y: s.h / 2,
      vx: Math.cos(angle) * START_SPEED,
      vy: Math.sin(angle) * START_SPEED,
    }
    s.live = true
    scored.current = false
  }, [])

  useCanvasSize(canvasRef, (w, h) => {
    const s = state.current
    s.w = w
    s.h = h
    s.paddleX[1] = w / 2
    s.paddleX[2] = w / 2
    if (!s.live) serve(Math.random() < 0.5 ? 1 : 2)
  })

  // Reset for each new point.
  useEffect(() => {
    if (running) serve(Math.random() < 0.5 ? 1 : 2)
  }, [running, serve])

  // A pointer belongs to whichever half it started in, so two thumbs never fight.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const owners = new Map<number, DuelPlayer>()

    const track = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      let owner = owners.get(event.pointerId)
      if (!owner) {
        owner = y < rect.height / 2 ? 1 : 2
        owners.set(event.pointerId, owner)
      }
      const half = PADDLE_WIDTH / 2
      state.current.paddleX[owner] = Math.max(half, Math.min(state.current.w - half, x))
    }

    const release = (event: PointerEvent) => owners.delete(event.pointerId)

    canvas.addEventListener('pointerdown', track)
    canvas.addEventListener('pointermove', track)
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
    return () => {
      canvas.removeEventListener('pointerdown', track)
      canvas.removeEventListener('pointermove', track)
      canvas.removeEventListener('pointerup', release)
      canvas.removeEventListener('pointercancel', release)
    }
  }, [])

  useGameLoop((dt) => {
    const s = state.current
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !s.w) return

    if (s.live) {
      s.ball.x += s.ball.vx * dt
      s.ball.y += s.ball.vy * dt

      // Side walls.
      if (s.ball.x < BALL_RADIUS) {
        s.ball.x = BALL_RADIUS
        s.ball.vx = Math.abs(s.ball.vx)
      } else if (s.ball.x > s.w - BALL_RADIUS) {
        s.ball.x = s.w - BALL_RADIUS
        s.ball.vx = -Math.abs(s.ball.vx)
      }

      // Paddles. Hitting off-centre angles the return, which is what makes
      // rallies interesting rather than a metronome.
      const hit = (player: DuelPlayer) => {
        const py = player === 1 ? PADDLE_INSET : s.h - PADDLE_INSET
        const withinY =
          player === 1
            ? s.ball.y - BALL_RADIUS <= py + PADDLE_HEIGHT / 2 && s.ball.vy < 0
            : s.ball.y + BALL_RADIUS >= py - PADDLE_HEIGHT / 2 && s.ball.vy > 0
        if (!withinY) return false
        const offset = s.ball.x - s.paddleX[player]
        if (Math.abs(offset) > PADDLE_WIDTH / 2 + BALL_RADIUS) return false

        const speed = Math.min(Math.hypot(s.ball.vx, s.ball.vy) * SPEED_GAIN, MAX_SPEED)
        const angle = (offset / (PADDLE_WIDTH / 2)) * 0.9
        s.ball.vx = Math.sin(angle) * speed
        s.ball.vy = Math.cos(angle) * speed * (player === 1 ? 1 : -1)
        s.ball.y = player === 1 ? py + PADDLE_HEIGHT / 2 + BALL_RADIUS : py - PADDLE_HEIGHT / 2 - BALL_RADIUS
        return true
      }
      hit(1)
      hit(2)

      // Past an edge: the other player scores. Guarded so one miss cannot
      // register twice while the frame finishes.
      if (!scored.current) {
        if (s.ball.y < -BALL_RADIUS * 2) {
          scored.current = true
          s.live = false
          onPoint(2)
        } else if (s.ball.y > s.h + BALL_RADIUS * 2) {
          scored.current = true
          s.live = false
          onPoint(1)
        }
      }
    }

    // ---- draw ----
    ctx.clearRect(0, 0, s.w, s.h)

    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.setLineDash([6, 10])
    ctx.beginPath()
    ctx.moveTo(0, s.h / 2)
    ctx.lineTo(s.w, s.h / 2)
    ctx.stroke()
    ctx.setLineDash([])

    const paddle = (player: DuelPlayer) => {
      const y = player === 1 ? PADDLE_INSET : s.h - PADDLE_INSET
      ctx.fillStyle = playerColor[player]
      ctx.beginPath()
      ctx.roundRect(
        s.paddleX[player] - PADDLE_WIDTH / 2,
        y - PADDLE_HEIGHT / 2,
        PADDLE_WIDTH,
        PADDLE_HEIGHT,
        PADDLE_HEIGHT / 2,
      )
      ctx.fill()
    }
    paddle(1)
    paddle(2)

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(s.ball.x, s.ball.y, BALL_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }, running)

  return <canvas ref={canvasRef} className="h-full w-full touch-none select-none" />
}
