'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useCanvasSize, useGameLoop } from '@/hooks/useGameLoop'
import { otherPlayer, playerColor, type DuelPlayer } from '@/lib/duel'

// Two discs in a ring. Drag anywhere in your half to thrust: the drag vector is
// the direction, its length is the throttle. Get shoved outside the ring and
// the point goes to the other player.

// Tuned so a full-throttle run from the middle takes roughly two seconds to
// leave the ring: fast enough to feel urgent, slow enough that you can stop
// yourself and that a good shove, rather than momentum, is what wins points.
const DISC_RADIUS = 26
const THRUST = 1500 // px/s² at full drag
const MAX_DRAG = 70 // px of drag for full throttle
const FRICTION = 3.2 // per second
const RESTITUTION = 1.5 // discs shove harder than they bounce
const MAX_SPEED = 620

type Disc = { x: number; y: number; vx: number; vy: number }

type State = {
  w: number
  h: number
  ring: { x: number; y: number; r: number }
  discs: Record<DuelPlayer, Disc>
  thrust: Record<DuelPlayer, { x: number; y: number }>
  live: boolean
}

export function Sumo({ onPoint, running }: { onPoint: (winner: DuelPlayer) => void; running: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useRef<State>({
    w: 0,
    h: 0,
    ring: { x: 0, y: 0, r: 0 },
    discs: {
      1: { x: 0, y: 0, vx: 0, vy: 0 },
      2: { x: 0, y: 0, vx: 0, vy: 0 },
    },
    thrust: { 1: { x: 0, y: 0 }, 2: { x: 0, y: 0 } },
    live: false,
  })
  const scored = useRef(false)

  const reset = useCallback(() => {
    const s = state.current
    if (!s.w) return
    s.ring = { x: s.w / 2, y: s.h / 2, r: Math.min(s.w, s.h) * 0.42 }
    s.discs[1] = { x: s.ring.x, y: s.ring.y - s.ring.r * 0.45, vx: 0, vy: 0 }
    s.discs[2] = { x: s.ring.x, y: s.ring.y + s.ring.r * 0.45, vx: 0, vy: 0 }
    s.thrust = { 1: { x: 0, y: 0 }, 2: { x: 0, y: 0 } }
    s.live = true
    scored.current = false
  }, [])

  useCanvasSize(canvasRef, (w, h) => {
    state.current.w = w
    state.current.h = h
    reset()
  })

  useEffect(() => {
    if (running) reset()
  }, [running, reset])

  // Each pointer is claimed by the half it starts in and keeps that owner until
  // release, so a thumb that strays across the middle still steers its own disc.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const origins = new Map<number, { owner: DuelPlayer; x: number; y: number }>()

    const down = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const y = event.clientY - rect.top
      const owner: DuelPlayer = y < rect.height / 2 ? 1 : 2
      origins.set(event.pointerId, { owner, x: event.clientX, y: event.clientY })
      state.current.thrust[owner] = { x: 0, y: 0 }
    }

    const move = (event: PointerEvent) => {
      const origin = origins.get(event.pointerId)
      if (!origin) return
      const dx = event.clientX - origin.x
      const dy = event.clientY - origin.y
      const length = Math.hypot(dx, dy)
      if (length < 4) {
        state.current.thrust[origin.owner] = { x: 0, y: 0 }
        return
      }
      const throttle = Math.min(length, MAX_DRAG) / MAX_DRAG
      state.current.thrust[origin.owner] = {
        x: (dx / length) * throttle,
        y: (dy / length) * throttle,
      }
    }

    const up = (event: PointerEvent) => {
      const origin = origins.get(event.pointerId)
      if (!origin) return
      state.current.thrust[origin.owner] = { x: 0, y: 0 }
      origins.delete(event.pointerId)
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    }
  }, [])

  useGameLoop((dt) => {
    const s = state.current
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !s.w) return

    if (s.live) {
      for (const player of [1, 2] as DuelPlayer[]) {
        const disc = s.discs[player]
        const thrust = s.thrust[player]
        disc.vx += thrust.x * THRUST * dt
        disc.vy += thrust.y * THRUST * dt

        const damp = Math.max(0, 1 - FRICTION * dt)
        disc.vx *= damp
        disc.vy *= damp

        const speed = Math.hypot(disc.vx, disc.vy)
        if (speed > MAX_SPEED) {
          disc.vx = (disc.vx / speed) * MAX_SPEED
          disc.vy = (disc.vy / speed) * MAX_SPEED
        }

        disc.x += disc.vx * dt
        disc.y += disc.vy * dt
      }

      // Elastic-ish collision: equal masses, extra restitution so a good shove
      // sends the other disc flying rather than gently nudging it.
      const a = s.discs[1]
      const b = s.discs[2]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1
      if (dist < DISC_RADIUS * 2) {
        const nx = dx / dist
        const ny = dy / dist
        const overlap = DISC_RADIUS * 2 - dist
        a.x -= (nx * overlap) / 2
        a.y -= (ny * overlap) / 2
        b.x += (nx * overlap) / 2
        b.y += (ny * overlap) / 2

        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
        if (rel < 0) {
          const impulse = (-(1 + RESTITUTION) * rel) / 2
          a.vx -= impulse * nx
          a.vy -= impulse * ny
          b.vx += impulse * nx
          b.vy += impulse * ny
        }
      }

      // Out of the ring: the survivor scores.
      if (!scored.current) {
        for (const player of [1, 2] as DuelPlayer[]) {
          const disc = s.discs[player]
          if (Math.hypot(disc.x - s.ring.x, disc.y - s.ring.y) > s.ring.r + DISC_RADIUS * 0.6) {
            scored.current = true
            s.live = false
            onPoint(otherPlayer(player))
            break
          }
        }
      }
    }

    // ---- draw ----
    ctx.clearRect(0, 0, s.w, s.h)

    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.beginPath()
    ctx.arc(s.ring.x, s.ring.y, s.ring.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 3
    ctx.stroke()

    for (const player of [1, 2] as DuelPlayer[]) {
      const disc = s.discs[player]
      const thrust = s.thrust[player]

      if (thrust.x || thrust.y) {
        ctx.strokeStyle = `${playerColor[player]}66`
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(disc.x, disc.y)
        ctx.lineTo(disc.x - thrust.x * 44, disc.y - thrust.y * 44)
        ctx.stroke()
      }

      ctx.fillStyle = playerColor[player]
      ctx.beginPath()
      ctx.arc(disc.x, disc.y, DISC_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.arc(disc.x, disc.y, DISC_RADIUS * 0.45, 0, Math.PI * 2)
      ctx.fill()
    }
  }, running)

  return <canvas ref={canvasRef} className="h-full w-full touch-none select-none" />
}
