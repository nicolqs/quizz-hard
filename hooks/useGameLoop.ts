'use client'

import { useEffect, useRef } from 'react'

/**
 * requestAnimationFrame loop with a delta clamped to 50ms.
 *
 * The clamp matters: when a phone locks or the tab is backgrounded the next
 * frame arrives seconds later, and an unclamped delta teleports the ball
 * through a paddle or a disc out of the ring.
 */
export function useGameLoop(callback: (deltaSeconds: number) => void, running: boolean) {
  const cb = useRef(callback)
  cb.current = callback

  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.05)
      last = now
      cb.current(delta)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running])
}

/** Sizes a canvas to its container in CSS pixels, accounting for retina. */
export function useCanvasSize(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  onResize?: (width: number, height: number) => void,
) {
  const handler = useRef(onResize)
  handler.current = onResize

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      handler.current?.(rect.width, rect.height)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [canvasRef])
}
