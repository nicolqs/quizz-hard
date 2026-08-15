'use client'

import { useEffect, useRef, useState } from 'react'
import { otherPlayer, playerColor, type DuelPlayer } from '@/lib/duel'

// Wait for green, then be first. Tapping before the light is a foul and hands
// the point to the other player, which is what stops both thumbs mashing.

type Phase = 'waiting' | 'go' | 'done'

export function Reaction({
  onPoint,
  running,
}: {
  onPoint: (winner: DuelPlayer, detail?: string) => void
  running: boolean
}) {
  const [phase, setPhase] = useState<Phase>('waiting')
  const [result, setResult] = useState<string | null>(null)
  const goAt = useRef(0)
  const settled = useRef(false)

  useEffect(() => {
    if (!running) return
    setPhase('waiting')
    setResult(null)
    settled.current = false

    // 1.5 to 4.5 seconds, so counting the beat never works.
    const delay = 1500 + Math.random() * 3000
    const timer = setTimeout(() => {
      goAt.current = performance.now()
      setPhase('go')
    }, delay)

    return () => clearTimeout(timer)
  }, [running])

  const tap = (player: DuelPlayer) => {
    if (settled.current || phase === 'done') return
    settled.current = true

    if (phase === 'waiting') {
      setPhase('done')
      setResult(`Too early. Point to ${playerLabel(otherPlayer(player))}.`)
      onPoint(otherPlayer(player), 'jumped the gun')
      return
    }

    const ms = Math.round(performance.now() - goAt.current)
    setPhase('done')
    setResult(`${playerLabel(player)} in ${ms}ms`)
    onPoint(player, `${ms}ms`)
  }

  const background =
    phase === 'go' ? 'bg-emerald-500' : phase === 'waiting' ? 'bg-slate-900' : 'bg-slate-800'

  return (
    <div className={`relative h-full w-full transition-colors duration-75 ${background}`}>
      {/* Top half belongs to player 1 and reads upside down. */}
      <button
        aria-label="Player 1 tap"
        onPointerDown={() => tap(1)}
        className="absolute inset-x-0 top-0 flex h-1/2 items-center justify-center"
      >
        <span className="rotate-180 text-center text-2xl font-black" style={{ color: playerColor[1] }}>
          {phase === 'go' ? 'TAP!' : phase === 'waiting' ? 'wait…' : ''}
        </span>
      </button>

      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center">
        {phase === 'waiting' && (
          <p className="text-sm uppercase tracking-[0.3em] text-white/40">hands off</p>
        )}
        {result && <p className="text-lg font-semibold text-white">{result}</p>}
      </div>

      <button
        aria-label="Player 2 tap"
        onPointerDown={() => tap(2)}
        className="absolute inset-x-0 bottom-0 flex h-1/2 items-center justify-center"
      >
        <span className="text-center text-2xl font-black" style={{ color: playerColor[2] }}>
          {phase === 'go' ? 'TAP!' : phase === 'waiting' ? 'wait…' : ''}
        </span>
      </button>
    </div>
  )
}

const playerLabel = (player: DuelPlayer) => (player === 1 ? 'Pink' : 'Cyan')
